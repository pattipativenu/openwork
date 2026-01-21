/**
 * Agent 2: Multi-Source Retrieval Coordinator
 * Orchestrates parallel retrieval from all required sources
 * Pure Python async orchestration (NO LLM)
 */

import { QueryAnalysis, EvidenceCandidate, TraceContext } from './types';
import { logRetrieval } from '../observability/arize-client';

// Sub-agent imports
import { GuidelinesRetriever } from './sub-agents/guidelines-retriever';
import { PubMedIntelligence } from './sub-agents/pubmed-intelligence';
import { FullTextFetcher } from './sub-agents/fulltext-fetcher';
import { DailyMedRetriever } from './sub-agents/dailymed-retriever';
import { TavilySmartSearch } from './sub-agents/tavily-search';

export interface RetrievalResults {
  guidelines: any[];
  pubmed: any[];
  dailymed: any[];
  tavily: any[];
}

export class MultiSourceRetrievalCoordinator {
  private guidelines: GuidelinesRetriever;
  private pubmed: PubMedIntelligence;
  private fullText: FullTextFetcher;
  private dailymed: DailyMedRetriever;
  private tavily: TavilySmartSearch;

  constructor(config: {
    ncbi_api_key: string;
    tavily_api_key: string;
  }) {
    this.guidelines = new GuidelinesRetriever();
    this.pubmed = new PubMedIntelligence(config.ncbi_api_key);
    this.fullText = new FullTextFetcher(config.ncbi_api_key);
    this.dailymed = new DailyMedRetriever();
    this.tavily = new TavilySmartSearch(config.tavily_api_key);
  }

  async retrieveAll(
    searchStrategy: QueryAnalysis,
    traceContext: TraceContext
  ): Promise<RetrievalResults> {
    const startTime = Date.now();
    const tasks: Promise<any>[] = [];
    const sources = searchStrategy.requires_sources;

    // Guidelines (always search if required)
    if (sources.guidelines) {
      tasks.push(
        this.guidelines.search(
          searchStrategy.search_variants,
          traceContext
        ).then(results => ({ type: 'guidelines', results }))
      );
    } else {
      tasks.push(Promise.resolve({ type: 'guidelines', results: [] }));
    }

    // PubMed (always search)
    if (sources.pubmed) {
      tasks.push(
        this.pubmed.search(
          searchStrategy.search_variants,
          searchStrategy.entities,
          traceContext
        ).then(results => ({ type: 'pubmed', results }))
      );
    } else {
      tasks.push(Promise.resolve({ type: 'pubmed', results: [] }));
    }

    // DailyMed (conditional)
    if (sources.dailymed && searchStrategy.entities.drugs.length > 0) {
      tasks.push(
        this.dailymed.search(
          searchStrategy.entities.drugs,
          traceContext
        ).then(results => ({ type: 'dailymed', results }))
      );
    } else {
      tasks.push(Promise.resolve({ type: 'dailymed', results: [] }));
    }

    // Execute all tasks in parallel
    const results = await Promise.all(tasks);
    const totalLatency = Date.now() - startTime;

    // Organize results
    const organizedResults: RetrievalResults = {
      guidelines: [],
      pubmed: [],
      dailymed: [],
      tavily: [] // Will be populated by Agent 5 if needed
    };

    for (const result of results) {
      organizedResults[result.type as keyof RetrievalResults] = result.results;
    }

    // Log total retrieval metrics
    const totalResults = Object.values(organizedResults).reduce((sum, arr) => sum + arr.length, 0);
    
    await logRetrieval(
      'multi_source_coordinator',
      traceContext,
      searchStrategy.search_variants.join(' | '),
      totalResults,
      totalLatency,
      {
        guidelines_count: organizedResults.guidelines.length,
        pubmed_count: organizedResults.pubmed.length,
        dailymed_count: organizedResults.dailymed.length,
        sources_used: Object.keys(sources).filter(k => sources[k as keyof typeof sources]).length
      }
    );

    console.log(`🔍 Multi-source retrieval complete: ${totalResults} documents in ${totalLatency}ms`);
    console.log(`   Guidelines: ${organizedResults.guidelines.length}`);
    console.log(`   PubMed: ${organizedResults.pubmed.length}`);
    console.log(`   DailyMed: ${organizedResults.dailymed.length}`);

    return organizedResults;
  }

  // Method to be called by Agent 5 if Tavily search needed
  async searchTavily(
    query: string,
    existingUrls: Set<string>,
    traceContext: TraceContext
  ): Promise<any[]> {
    return this.tavily.search(query, existingUrls, traceContext);
  }
}