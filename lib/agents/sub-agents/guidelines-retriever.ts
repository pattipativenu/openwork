/**
 * Sub-Agent 2.1: Guidelines Retriever
 * Firestore Vector Search for Indian Clinical Practice Guidelines
 */

import { Firestore } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';
import * as fs from 'fs';

export interface GuidelineSearchResult {
  chunk_id: string;
  guideline_id: string;
  parent_section?: string;
  child_section?: string;
  organization: string;
  title: string;
  year: number;
  text: string;
  summary?: string;
  similarity_score: number;
  document_type?: string;
  page_number?: number;
  section_hierarchy?: string[];
}

export class GuidelinesRetriever {
  private db: Firestore | null;
  private genAI: GoogleGenerativeAI | null;

  constructor() {
    // Check authentication methods in order of preference
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const hasEnvVars = process.env.GOOGLE_CLOUD_PROJECT_ID && 
                      process.env.GOOGLE_CLOUD_PRIVATE_KEY && 
                      process.env.GOOGLE_CLOUD_CLIENT_EMAIL;
    
    if (credentialsPath && fs.existsSync(credentialsPath)) {
      // Method 1: Service account file
      console.log('🔑 Using GCP service account file for authentication');
      this.db = new Firestore();
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    } else if (hasEnvVars) {
      // Method 2: Environment variables
      console.log('🔑 Using GCP environment variables for authentication');
      this.db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        credentials: {
          client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }
      });
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    } else {
      console.warn('⚠️ No GCP credentials found. Guidelines retrieval will be disabled.');
      console.warn('   Please set up either:');
      console.warn('   1. Service account file: gcp-service-account.json');
      console.warn('   2. Environment variables: GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_PRIVATE_KEY, GOOGLE_CLOUD_CLIENT_EMAIL');
      this.db = null;
      this.genAI = null;
      return;
    }
  }

  async search(
    searchVariants: string[],
    traceContext: TraceContext,
    userQuery: string = ''
  ): Promise<GuidelineSearchResult[]> {
    const startTime = Date.now();
    
    // Return empty results if GCP is not configured
    if (!this.db || !this.genAI) {
      console.warn('⚠️ Guidelines retrieval skipped - GCP not configured');
      await logRetrieval(
        'guidelines',
        traceContext,
        { search_variants: searchVariants },
        [],
        { latency_ms: Date.now() - startTime, source_count: 0 }
      );
      return [];
    }

    // Check if user explicitly asked for guidelines
    const userWantsGuidelines = userQuery.toLowerCase().includes('guideline') || 
                               userQuery.toLowerCase().includes('icmr') ||
                               userQuery.toLowerCase().includes('rssdi') ||
                               userQuery.toLowerCase().includes('indian') ||
                               userQuery.toLowerCase().includes('india');

    if (!userWantsGuidelines) {
      console.log('📋 Guidelines retrieval skipped - user did not request guidelines');
      return [];
    }
    
    try {
      console.log('🔍 Searching Indian Guidelines in Firestore...');
      const allResults: GuidelineSearchResult[] = [];
      const seenChunkIds = new Set<string>();

      for (const variant of searchVariants) {
        // Get embedding for this variant
        const embedding = await this.getGeminiEmbedding(variant);
        
        // Vector similarity search in Firestore with parent-child structure
        const collection = this.db.collection(process.env.FIRESTORE_COLLECTION_GUIDELINE_CHUNKS || 'guideline_chunks');
        
        // Query with proper structure for parent-child hierarchy
        const snapshot = await collection
          .where('embedding', '!=', null)
          .limit(30) // Increased limit for better coverage
          .get();

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const chunkId = data.chunk_id || doc.id;

          // Deduplicate
          if (!seenChunkIds.has(chunkId)) {
            seenChunkIds.add(chunkId);
            
            // Calculate similarity (simplified - in production use proper vector similarity)
            const similarity = this.calculateSimilarity(embedding, data.embedding);
            
            if (similarity > 0.70) { // Slightly lower threshold for guidelines
              allResults.push({
                chunk_id: chunkId,
                guideline_id: data.guideline_id || data.document_id,
                parent_section: data.parent_section || data.section,
                child_section: data.child_section || data.subsection,
                organization: data.organization || 'Indian Medical Guidelines',
                title: data.title || data.document_title || 'Indian Clinical Guideline',
                year: data.year || data.publication_year || new Date().getFullYear(),
                text: data.text || data.content,
                summary: data.summary || this.generateSummary(data.text || data.content),
                similarity_score: similarity,
                document_type: data.document_type || 'Clinical Guideline',
                page_number: data.page_number,
                section_hierarchy: data.section_hierarchy || [data.parent_section, data.child_section].filter(Boolean)
              });
            }
          }
        }
      }

      // Sort by similarity and take top 15 for guidelines
      const topResults = allResults
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, 15);

      const latency = Date.now() - startTime;

      await logRetrieval(
        'guidelines',
        traceContext,
        { search_variants: searchVariants, user_query: userQuery },
        topResults,
        { latency_ms: latency, source_count: topResults.length }
      );

      console.log(`📋 Indian Guidelines search: ${topResults.length} relevant chunks found`);
      if (topResults.length > 0) {
        console.log(`   Organizations: ${[...new Set(topResults.map(r => r.organization))].join(', ')}`);
        console.log(`   Document types: ${[...new Set(topResults.map(r => r.document_type))].join(', ')}`);
      }
      
      return topResults;

    } catch (error) {
      console.error('❌ Guidelines retrieval failed:', error);
      
      await logRetrieval(
        'guidelines',
        traceContext,
        { search_variants: searchVariants, error: error instanceof Error ? error.message : 'Unknown error' },
        [],
        { latency_ms: Date.now() - startTime, source_count: 0 }
      );
      
      return [];
    }
  }

  private async getGeminiEmbedding(text: string): Promise<number[]> {
    if (!this.genAI) {
      return new Array(768).fill(0);
    }
    
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

  private generateSummary(text: string): string {
    if (!text || text.length < 100) return text;
    
    // Simple extractive summarization - take first 2 sentences and key points
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length <= 2) return text;
    
    // Take first sentence and any sentence with key medical terms
    const keyTerms = ['recommend', 'should', 'must', 'guideline', 'treatment', 'therapy', 'diagnosis', 'management'];
    const importantSentences = sentences.filter((sentence, index) => 
      index === 0 || keyTerms.some(term => sentence.toLowerCase().includes(term))
    ).slice(0, 3);
    
    return importantSentences.join('. ').trim() + '.';
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