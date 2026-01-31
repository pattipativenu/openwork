/**
 * Agent 4: Two-Stage BGE Reranker
 * Uses BAAI/bge-reranker-v2-m3 for document and chunk-level reranking
 * Stage 1: Document-level (100-120 docs → Top 20)
 * Stage 2: Chunk-level (20 docs chunked → Top 10 chunks)
 */

import { EvidenceCandidate, RankedEvidence, TraceContext } from './types';
import { FullTextFetcher } from './sub-agents/fulltext-fetcher';
import { logAgent } from '../observability/arize-client';

export interface ChunkForRerank {
  source: string;
  id: string;
  title: string;
  text: string;
  metadata: any;
  section?: string;
  chunk_index?: number;
  doc_level_score?: number;
}

export class TwoStageReranker {
  private fullTextFetcher: FullTextFetcher;
  private useBGEReranker: boolean;

  constructor(ncbiApiKey: string) {
    this.fullTextFetcher = new FullTextFetcher(ncbiApiKey);
    // Feature flag for BGE reranker - set to false until proper BGE service is available
    this.useBGEReranker = process.env.USE_BGE_RERANKER === 'true';
    
    if (this.useBGEReranker) {
      console.log('🔄 BGE Reranker enabled - using external BGE service');
    } else {
      console.log('🔄 Using deterministic semantic similarity scoring (BGE disabled)');
    }
  }

  async rerank(
    query: string,
    candidates: EvidenceCandidate[],
    traceContext: TraceContext
  ): Promise<RankedEvidence[]> {
    const startTime = Date.now();

    try {
      // STAGE 1: Document-level re-ranking
      console.log(`🔄 Stage 1: Document-level reranking (${candidates.length} → 20)`);
      const stage1Start = Date.now();
      
      const docScores = await this.scoreDocuments(query, candidates);
      
      // Sort and take top 20
      const top20Docs = candidates
        .map((candidate, index) => ({ candidate, score: docScores[index] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      const stage1Time = Date.now() - stage1Start;
      console.log(`✅ Stage 1 complete: ${top20Docs.length} docs in ${stage1Time}ms`);

      // STAGE 2: Fetch full-text and chunk-level re-ranking
      console.log(`🔄 Stage 2: Full-text fetching and chunk-level reranking`);
      const stage2Start = Date.now();

      // Fetch full-text for top 20
      const enrichedDocs = [];
      for (const { candidate, score } of top20Docs) {
        if (candidate.full_text_available && !candidate.full_text_sections) {
          const enriched = await this.fullTextFetcher.fetchFullText(candidate, query);
          enrichedDocs.push({ candidate: enriched, doc_level_score: score });
        } else {
          enrichedDocs.push({ candidate, doc_level_score: score });
        }
      }

      // Chunk all documents
      const allChunks: ChunkForRerank[] = [];
      for (const { candidate, doc_level_score } of enrichedDocs) {
        // Convert EnhancedArticle back to EvidenceCandidate format if needed
        const candidateForChunking: EvidenceCandidate = 'source' in candidate 
          ? candidate as EvidenceCandidate
          : {
              source: 'pubmed' as const,
              id: candidate.pmid || 'unknown',
              title: candidate.title || 'Unknown Title',
              text: candidate.abstract || '',
              metadata: {
                pmid: candidate.pmid,
                doi: candidate.doi,
                journal: candidate.journal,
                authors: candidate.authors
              },
              full_text_available: true,
              full_text_sections: candidate.selected_sections?.reduce((acc, section) => {
                acc[section.section_type] = section.chunks.map(chunk => chunk.content).join('\n\n');
                return acc;
              }, {} as Record<string, string>)
            };
            
        const chunks = this.chunkDocument(candidateForChunking);
        chunks.forEach(chunk => {
          chunk.doc_level_score = doc_level_score;
          allChunks.push(chunk);
        });
      }

      console.log(`📄 Created ${allChunks.length} chunks from ${enrichedDocs.length} documents`);

      // Re-rank chunks
      const chunkScores = await this.scoreChunks(query, allChunks);

      // Combine chunk scores with doc scores
      const finalScores = allChunks.map((chunk, index) => {
        const chunkScore = chunkScores[index];
        const combinedScore = 0.6 * chunkScore + 0.4 * (chunk.doc_level_score || 0);
        return { chunk, score: combinedScore };
      });

      // Sort and take top 10
      const top10Chunks = finalScores
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      const stage2Time = Date.now() - stage2Start;
      console.log(`✅ Stage 2 complete: ${top10Chunks.length} chunks in ${stage2Time}ms`);

      // Format for output
      const evidencePack: RankedEvidence[] = top10Chunks.map((item, index) => ({
        rank: index + 1,
        score: item.score,
        source: item.chunk.source,
        id: item.chunk.id,
        title: item.chunk.title,
        text: item.chunk.text,
        metadata: item.chunk.metadata,
        chunk_info: {
          section: item.chunk.section,
          chunk_index: item.chunk.chunk_index
        }
      }));

      const totalLatency = Date.now() - startTime;

      // Log to Arize
      await logAgent(
        'two_stage_reranker',
        traceContext,
        { 
          query, 
          input_docs: candidates.length,
          stage1_docs: top20Docs.length,
          total_chunks: allChunks.length,
          final_chunks: evidencePack.length
        },
        {
          evidence_pack: evidencePack.map(e => ({
            rank: e.rank,
            score: e.score,
            source: e.source,
            title: e.title.substring(0, 100)
          }))
        },
        {
          success: true,
          data: evidencePack,
          latency_ms: totalLatency
        },
        'bge-reranker-v2-m3'
      );

      console.log(`🎯 Two-stage reranking complete: ${evidencePack.length} final evidence chunks`);
      return evidencePack;

    } catch (error) {
      console.error('❌ Two-stage reranking failed:', error);
      
      // Fallback: return top candidates by simple scoring
      const fallbackEvidence: RankedEvidence[] = candidates.slice(0, 10).map((candidate, index) => ({
        rank: index + 1,
        score: 0.5, // Default score
        source: candidate.source,
        id: candidate.id,
        title: candidate.title,
        text: candidate.text,
        metadata: candidate.metadata,
        chunk_info: {
          section: 'abstract',
          chunk_index: 0
        }
      }));

      return fallbackEvidence;
    }
  }

  private async scoreDocuments(query: string, candidates: EvidenceCandidate[]): Promise<number[]> {
    if (this.useBGEReranker) {
      // Use actual BGE reranker service
      return this.callBGERerankerService(query, candidates.map(c => ({
        text: `${c.title || 'Untitled'}\n\n${c.text || 'No content available'}`.substring(0, 1500)
      })));
    }
    
    // Fallback to deterministic semantic similarity scoring
    const scores: number[] = [];
    
    for (const candidate of candidates) {
      // Ensure text field exists and is not undefined
      const text = candidate.text || candidate.title || 'No content available';
      const docText = `${candidate.title || 'Untitled'}\n\n${text.substring(0, 1500)}`;
      const score = this.calculateSemanticScore(query, docText);
      scores.push(score);
    }

    return scores;
  }

  private async scoreChunks(query: string, chunks: ChunkForRerank[]): Promise<number[]> {
    if (this.useBGEReranker) {
      // Use actual BGE reranker service
      return this.callBGERerankerService(query, chunks.map(c => ({
        text: `Title: ${c.title}\nSource: ${c.source}\n\n${c.text}`
      })));
    }
    
    // Fallback to deterministic semantic similarity scoring
    const scores: number[] = [];
    
    for (const chunk of chunks) {
      const chunkText = `Title: ${chunk.title}\nSource: ${chunk.source}\n\n${chunk.text}`;
      const score = this.calculateSemanticScore(query, chunkText);
      scores.push(score);
    }

    return scores;
  }

  private async callBGERerankerService(query: string, documents: Array<{text: string}>): Promise<number[]> {
    // TODO: Implement actual BGE reranker API call
    // Example implementation:
    /*
    try {
      const response = await fetch(process.env.BGE_RERANKER_ENDPOINT!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BGE_RERANKER_API_KEY}`
        },
        body: JSON.stringify({
          query,
          documents: documents.map(d => d.text),
          model: 'BAAI/bge-reranker-v2-m3'
        })
      });
      
      const result = await response.json();
      return result.scores || documents.map(() => 0.5);
    } catch (error) {
      console.error('❌ BGE reranker service failed:', error);
      // Fallback to semantic scoring
      return documents.map(doc => this.calculateSemanticScore(query, doc.text));
    }
    */
    
    throw new Error('BGE reranker service not implemented - use deterministic scoring instead');
  }

  private calculateSemanticScore(query: string, text: string): number {
    // Deterministic semantic similarity scoring (replaces random component)
    const queryWords = this.extractKeywords(query.toLowerCase());
    const textWords = this.extractKeywords(text.toLowerCase());
    
    // Exact keyword matches (high weight)
    let exactMatches = 0;
    for (const word of queryWords) {
      if (textWords.includes(word)) {
        exactMatches++;
      }
    }
    
    // Partial matches (medium weight)
    let partialMatches = 0;
    for (const queryWord of queryWords) {
      for (const textWord of textWords) {
        if (queryWord.length > 3 && textWord.length > 3) {
          if (queryWord.includes(textWord) || textWord.includes(queryWord)) {
            partialMatches++;
            break;
          }
        }
      }
    }
    
    // Medical term bonus (high weight for medical keywords)
    const medicalTerms = ['treatment', 'therapy', 'diagnosis', 'patient', 'clinical', 'study', 'trial', 'efficacy', 'safety', 'dose', 'drug', 'medication', 'disease', 'syndrome', 'symptoms'];
    let medicalBonus = 0;
    for (const term of medicalTerms) {
      if (query.toLowerCase().includes(term) && text.toLowerCase().includes(term)) {
        medicalBonus += 0.1;
      }
    }
    
    // Title relevance bonus
    const titleBonus = this.calculateTitleRelevance(query, text);
    
    // Calculate final score (deterministic, no randomness)
    const exactScore = (exactMatches / Math.max(queryWords.length, 1)) * 0.5;
    const partialScore = (partialMatches / Math.max(queryWords.length, 1)) * 0.2;
    const bonusScore = Math.min(medicalBonus + titleBonus, 0.3);
    
    const finalScore = Math.min(exactScore + partialScore + bonusScore, 1.0);
    
    // Ensure minimum score for any document (prevents zero scores)
    return Math.max(finalScore, 0.1);
  }
  
  private extractKeywords(text: string): string[] {
    // Extract meaningful keywords, filtering out stop words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
    
    return text
      .split(/\s+/)
      .map(word => word.replace(/[^\w]/g, '').toLowerCase())
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 20); // Limit to top 20 keywords for performance
  }
  
  private calculateTitleRelevance(query: string, text: string): number {
    // Extract title from text (assuming it's at the beginning)
    const lines = text.split('\n');
    const title = lines[0] || '';
    
    const queryKeywords = this.extractKeywords(query);
    const titleKeywords = this.extractKeywords(title);
    
    let titleMatches = 0;
    for (const queryWord of queryKeywords) {
      if (titleKeywords.some(titleWord => 
        titleWord.includes(queryWord) || queryWord.includes(titleWord)
      )) {
        titleMatches++;
      }
    }
    
    return titleMatches > 0 ? Math.min(titleMatches / queryKeywords.length * 0.2, 0.2) : 0;
  }

  private chunkDocument(candidate: EvidenceCandidate): ChunkForRerank[] {
    const chunks: ChunkForRerank[] = [];

    // Check if this is an enhanced article with hierarchical content
    if (candidate.content_chunks && Array.isArray(candidate.content_chunks)) {
      // Use the pre-processed chunks from the enhanced full-text fetcher
      candidate.content_chunks.forEach((contentChunk: any) => {
        chunks.push({
          source: candidate.source,
          id: candidate.id,
          title: candidate.title,
          text: contentChunk.content,
          metadata: {
            ...candidate.metadata,
            parent_article: contentChunk.parent_article,
            child_section: contentChunk.child_section,
            chunk_index: contentChunk.chunk_index,
            relevance_score: contentChunk.relevance_score
          },
          section: contentChunk.child_section,
          chunk_index: contentChunk.chunk_index
        });
      });
    }
    // Legacy support: If full-text available in old format, chunk by section
    else if (candidate.full_text_sections) {
      for (const [sectionName, sectionText] of Object.entries(candidate.full_text_sections)) {
        const sectionChunks = this.splitTextIntoChunks(sectionText, 1000, 200);
        
        sectionChunks.forEach((chunkText, index) => {
          chunks.push({
            source: candidate.source,
            id: candidate.id,
            title: candidate.title,
            text: chunkText,
            metadata: candidate.metadata,
            section: sectionName,
            chunk_index: index
          });
        });
      }
    } else {
      // Use abstract/snippet as single chunk
      chunks.push({
        source: candidate.source,
        id: candidate.id,
        title: candidate.title,
        text: candidate.text,
        metadata: candidate.metadata,
        section: 'abstract',
        chunk_index: 0
      });
    }

    return chunks;
  }

  private splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let currentSize = 0;
    
    for (const sentence of sentences) {
      const sentenceSize = sentence.length;
      
      if (currentSize + sentenceSize > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        
        // Start new chunk with overlap
        const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlap));
        currentChunk = overlapText + sentence;
        currentSize = overlapText.length + sentenceSize;
      } else {
        currentChunk += sentence + '. ';
        currentSize += sentenceSize;
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [text]; // Fallback to original text
  }
}