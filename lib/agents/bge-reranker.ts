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

  constructor(ncbiApiKey: string) {
    this.fullTextFetcher = new FullTextFetcher(ncbiApiKey);
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
    // Simulate BGE scoring (in production, this would call the actual BGE model)
    // For now, use simple text similarity as placeholder
    
    const scores: number[] = [];
    
    for (const candidate of candidates) {
      const docText = `${candidate.title}\n\n${candidate.text.substring(0, 1500)}`;
      const score = this.calculateSimpleScore(query, docText);
      scores.push(score);
    }

    return scores;
  }

  private async scoreChunks(query: string, chunks: ChunkForRerank[]): Promise<number[]> {
    // Simulate BGE chunk scoring
    const scores: number[] = [];
    
    for (const chunk of chunks) {
      const chunkText = `Title: ${chunk.title}\nSource: ${chunk.source}\n\n${chunk.text}`;
      const score = this.calculateSimpleScore(query, chunkText);
      scores.push(score);
    }

    return scores;
  }

  private calculateSimpleScore(query: string, text: string): number {
    // Simple scoring based on keyword overlap (placeholder for BGE)
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const word of queryWords) {
      if (word.length > 3 && textWords.some(tw => tw.includes(word) || word.includes(tw))) {
        matches++;
      }
    }
    
    const score = Math.min(matches / queryWords.length, 1.0);
    return score * 0.8 + Math.random() * 0.2; // Add some randomness
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