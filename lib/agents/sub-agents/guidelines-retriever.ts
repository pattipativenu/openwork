/**
 * Sub-Agent 2.1: Guidelines Retriever
 * Firestore Vector Search for Indian Clinical Practice Guidelines
 */

import { Firestore } from '@google/cloud-firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';

export interface GuidelineSearchResult {
  chunk_id: string;
  guideline_id: string;
  organization: string;
  title: string;
  year: number;
  text: string;
  similarity_score: number;
}

export class GuidelinesRetriever {
  private db: Firestore;
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.db = new Firestore();
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async search(
    searchVariants: string[],
    traceContext: TraceContext
  ): Promise<GuidelineSearchResult[]> {
    const startTime = Date.now();
    
    try {
      const allResults: GuidelineSearchResult[] = [];
      const seenChunkIds = new Set<string>();

      for (const variant of searchVariants) {
        // Get embedding for this variant
        const embedding = await this.getGeminiEmbedding(variant);
        
        // Vector similarity search in Firestore
        const collection = this.db.collection('guideline_chunks');
        
        // Note: This is a simplified version. In production, you'd use Firestore's vector search
        // For now, we'll simulate with a regular query and filter
        const snapshot = await collection
          .where('embedding', '!=', null)
          .limit(20)
          .get();

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const chunkId = data.chunk_id;

          // Deduplicate
          if (!seenChunkIds.has(chunkId)) {
            seenChunkIds.add(chunkId);
            
            // Calculate similarity (simplified - in production use proper vector similarity)
            const similarity = this.calculateSimilarity(embedding, data.embedding);
            
            if (similarity > 0.75) { // Threshold for relevance
              allResults.push({
                chunk_id: chunkId,
                guideline_id: data.guideline_id,
                organization: data.organization,
                title: data.title,
                year: data.year,
                text: data.text,
                similarity_score: similarity
              });
            }
          }
        }
      }

      // Sort by similarity and take top 20
      const topResults = allResults
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, 20);

      const latency = Date.now() - startTime;

      await logRetrieval(
        'guidelines',
        traceContext,
        searchVariants.join(' | '),
        topResults.length,
        latency,
        {
          variants_searched: searchVariants.length,
          total_candidates: allResults.length,
          after_dedup: topResults.length
        }
      );

      console.log(`📋 Guidelines search: ${topResults.length} relevant chunks found`);
      return topResults;

    } catch (error) {
      console.error('❌ Guidelines retrieval failed:', error);
      
      await logRetrieval(
        'guidelines',
        traceContext,
        searchVariants.join(' | '),
        0,
        Date.now() - startTime,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );

      return [];
    }
  }

  private async getGeminiEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      // Return dummy embedding for fallback
      return new Array(768).fill(0);
    }
  }

  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    // Cosine similarity calculation
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}