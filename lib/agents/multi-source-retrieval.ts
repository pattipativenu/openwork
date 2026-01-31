/**
 * Agent 2: Multi-Source Retrieval Coordinator
 * Orchestrates parallel retrieval from all required sources with intelligent sub-agent routing
 * ENHANCED: Now uses specialized queries from Agent 1 for optimal sub-agent performance
 */

import { QueryAnalysis, EvidenceCandidate, TraceContext } from './types';
import { logRetrieval } from '../observability/arize-client';

// EVIDENCE ENGINE INTEGRATION - Use the comprehensive 57+ source system
import { comprehensivePubMedSearch } from '../evidence/pubmed';
import { comprehensiveDailyMedSearch } from '../evidence/dailymed';
import { comprehensiveCochraneSearch } from '../evidence/cochrane';
import { searchClinicalTrials } from '../evidence/clinical-trials';

// Sub-agent imports with specialized query handling
import { GuidelinesRetriever } from './sub-agents/guidelines-retriever';
import { PubMedIntelligence } from './sub-agents/pubmed-intelligence';
import { DailyMedRetriever } from './sub-agents/dailymed-retriever';
import { TavilySmartSearch } from './sub-agents/tavily-search';

export interface RetrievalResults {
  guidelines: any[];
  pubmed: any[];
  dailymed: any[];
  clinical_trials: any[];
  cochrane: any[];
  bmj: any[];
  nice: any[];
  who: any[];
  cdc: any[];
  landmark_trials: any[];
  semantic_scholar: any[];
  europe_pmc: any[];
  pmc: any[];
  openalex: any[];
  tavily: any[];
}

export class MultiSourceRetrievalCoordinator {
  private guidelines: GuidelinesRetriever;
  private pubmedIntelligence: PubMedIntelligence;
  private dailymedRetriever: DailyMedRetriever;
  private tavily: TavilySmartSearch;

  constructor(config: {
    ncbi_api_key: string;
    tavily_api_key: string;
  }) {
    // Initialize sub-agents with specialized capabilities
    this.guidelines = new GuidelinesRetriever();
    this.pubmedIntelligence = new PubMedIntelligence(config.ncbi_api_key);
    this.dailymedRetriever = new DailyMedRetriever();
    this.tavily = new TavilySmartSearch(config.tavily_api_key);
  }

  async retrieveAll(
    searchStrategy: QueryAnalysis,
    traceContext: TraceContext,
    originalQuery?: string
  ): Promise<RetrievalResults> {
    const startTime = Date.now();
    const tasks: Promise<any>[] = [];
    const sources = searchStrategy.requires_sources;
    const subAgentQueries = searchStrategy.sub_agent_queries;

    console.log(`🔍 Starting intelligent sub-agent retrieval with specialized queries...`);
    console.log(`📋 Original query: "${originalQuery || 'Not provided'}"`);
    console.log(`🎯 Sub-agent routing decisions:`);
    console.log(`   Guidelines: ${subAgentQueries.guidelines?.should_call ? '✓' : '✗'} - ${subAgentQueries.guidelines?.reasoning}`);
    console.log(`   PubMed: ${subAgentQueries.pubmed?.should_call ? '✓' : '✗'} - ${subAgentQueries.pubmed?.reasoning}`);
    console.log(`   DailyMed: ${subAgentQueries.dailymed?.should_call ? '✓' : '✗'} - ${subAgentQueries.dailymed?.reasoning}`);

    // Add timeout wrapper for all searches (30 seconds max)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Retrieval timeout')), 30000)
    );

    // 1. Guidelines Retriever - Use specialized queries from Agent 1
    if (subAgentQueries.guidelines?.should_call && subAgentQueries.guidelines.rephrased_queries.length > 0) {
      console.log(`📋 Guidelines: Using ${subAgentQueries.guidelines.rephrased_queries.length} specialized queries`);
      tasks.push(
        this.guidelines.search(
          subAgentQueries.guidelines.rephrased_queries,
          traceContext,
          originalQuery
        ).then(results => ({ type: 'guidelines', results }))
      );
    } else {
      tasks.push(Promise.resolve({ type: 'guidelines', results: [] }));
    }

    // 2. PubMed Intelligence - Use specialized queries with MeSH terms from Agent 1
    if (subAgentQueries.pubmed?.should_call && subAgentQueries.pubmed.rephrased_queries.length > 0) {
      console.log(`🔬 PubMed: Using ${subAgentQueries.pubmed.rephrased_queries.length} specialized queries with MeSH terms`);
      tasks.push(
        this.pubmedIntelligence.search(
          subAgentQueries.pubmed.rephrased_queries,
          searchStrategy.entities,
          traceContext,
          originalQuery
        ).then(results => ({ type: 'pubmed', results }))
      );
    } else {
      tasks.push(Promise.resolve({ type: 'pubmed', results: [] }));
    }

    // 3. DailyMed Retriever - Use clean drug names from Agent 1
    if (subAgentQueries.dailymed?.should_call && subAgentQueries.dailymed.drug_names.length > 0) {
      console.log(`💊 DailyMed: Using ${subAgentQueries.dailymed.drug_names.length} clean drug names`);
      tasks.push(
        this.dailymedRetriever.search(
          subAgentQueries.dailymed.drug_names,
          traceContext,
          originalQuery
        ).then(results => ({ type: 'dailymed', results }))
      );
    } else {
      tasks.push(Promise.resolve({ type: 'dailymed', results: [] }));
    }

    // 4. Clinical Trials (Evidence Engine)
    tasks.push(
      searchClinicalTrials(
        searchStrategy.search_variants.join(' OR '),
        20 // maxResults
      ).then(results => ({ type: 'clinical_trials', results }))
    );

    // 5. Cochrane Reviews (Evidence Engine)
    tasks.push(
      comprehensiveCochraneSearch(
        searchStrategy.search_variants.join(' OR ')
      ).then(results => ({ type: 'cochrane', results: results.allReviews }))
    );

    // 6-14. Other sources - Use placeholder functions for now
    // TODO: Implement these functions in their respective files
    tasks.push(Promise.resolve({ type: 'bmj', results: [] }));
    tasks.push(Promise.resolve({ type: 'nice', results: [] }));
    tasks.push(Promise.resolve({ type: 'who', results: [] }));
    tasks.push(Promise.resolve({ type: 'cdc', results: [] }));
    tasks.push(Promise.resolve({ type: 'landmark_trials', results: [] }));
    tasks.push(Promise.resolve({ type: 'semantic_scholar', results: [] }));
    tasks.push(Promise.resolve({ type: 'europe_pmc', results: [] }));
    tasks.push(Promise.resolve({ type: 'pmc', results: [] }));
    tasks.push(Promise.resolve({ type: 'openalex', results: [] }));

    // Execute all tasks in parallel with timeout
    console.log(`⚡ Executing ${tasks.length} parallel searches with intelligent routing...`);
    
    try {
      const results = await Promise.race([
        Promise.all(tasks),
        timeoutPromise
      ]) as any[];
      
      const totalLatency = Date.now() - startTime;

    // Organize results
    const organizedResults: RetrievalResults = {
      guidelines: [],
      pubmed: [],
      dailymed: [],
      clinical_trials: [],
      cochrane: [],
      bmj: [],
      nice: [],
      who: [],
      cdc: [],
      landmark_trials: [],
      semantic_scholar: [],
      europe_pmc: [],
      pmc: [],
      openalex: [],
      tavily: [] // Will be populated by Agent 5 if needed
    };

    for (const result of results) {
      organizedResults[result.type as keyof RetrievalResults] = result.results || [];
    }

    // Log comprehensive retrieval metrics with sub-agent intelligence
    const totalResults = Object.values(organizedResults).reduce((sum, arr) => sum + arr.length, 0);
    
    await logRetrieval(
      'intelligent_multi_source',
      traceContext,
      searchStrategy.search_variants.join(' | '),
      totalResults,
      totalLatency,
      {
        guidelines_count: organizedResults.guidelines.length,
        guidelines_called: subAgentQueries.guidelines?.should_call || false,
        guidelines_queries: subAgentQueries.guidelines?.rephrased_queries.length || 0,
        pubmed_count: organizedResults.pubmed.length,
        pubmed_called: subAgentQueries.pubmed?.should_call || false,
        pubmed_queries: subAgentQueries.pubmed?.rephrased_queries.length || 0,
        pubmed_mesh_terms: subAgentQueries.pubmed?.mesh_terms.length || 0,
        dailymed_count: organizedResults.dailymed.length,
        dailymed_called: subAgentQueries.dailymed?.should_call || false,
        dailymed_drugs: subAgentQueries.dailymed?.drug_names.length || 0,
        clinical_trials_count: organizedResults.clinical_trials.length,
        cochrane_count: organizedResults.cochrane.length,
        bmj_count: organizedResults.bmj.length,
        nice_count: organizedResults.nice.length,
        who_count: organizedResults.who.length,
        cdc_count: organizedResults.cdc.length,
        landmark_trials_count: organizedResults.landmark_trials.length,
        semantic_scholar_count: organizedResults.semantic_scholar.length,
        europe_pmc_count: organizedResults.europe_pmc.length,
        pmc_count: organizedResults.pmc.length,
        openalex_count: organizedResults.openalex.length,
        sub_agents_called: [
          subAgentQueries.guidelines?.should_call,
          subAgentQueries.pubmed?.should_call,
          subAgentQueries.dailymed?.should_call
        ].filter(Boolean).length
      }
    );

    console.log(`✅ Intelligent evidence retrieval complete: ${totalResults} documents in ${totalLatency}ms`);
    console.log(`🎯 Sub-agent performance:`);
    console.log(`   📚 Guidelines: ${organizedResults.guidelines.length} (${subAgentQueries.guidelines?.rephrased_queries.length || 0} specialized queries)`);
    console.log(`   � PubMed: ${organizedResults.pubmed.length} (${subAgentQueries.pubmed?.rephrased_queries.length || 0} queries, ${subAgentQueries.pubmed?.mesh_terms.length || 0} MeSH terms)`);
    console.log(`   � DailyMed: ${organizedResults.dailymed.length} (${subAgentQueries.dailymed?.drug_names.length || 0} clean drug names)`);
    console.log(`   🧪 Clinical Trials: ${organizedResults.clinical_trials.length}`);
    console.log(`   📊 Cochrane: ${organizedResults.cochrane.length}`);
    console.log(`   🏥 BMJ: ${organizedResults.bmj.length}`);
    console.log(`   🇬🇧 NICE: ${organizedResults.nice.length}`);
    console.log(`   🌍 WHO: ${organizedResults.who.length}`);
    console.log(`   🇺🇸 CDC: ${organizedResults.cdc.length}`);
    console.log(`   ⭐ Landmark Trials: ${organizedResults.landmark_trials.length}`);
    console.log(`   🎓 Semantic Scholar: ${organizedResults.semantic_scholar.length}`);
    console.log(`   🇪🇺 Europe PMC: ${organizedResults.europe_pmc.length}`);
    console.log(`   📄 PMC Full-text: ${organizedResults.pmc.length}`);
    console.log(`   🔍 OpenAlex: ${organizedResults.openalex.length}`);

    return organizedResults;
    
    } catch (error) {
      console.error('❌ Intelligent evidence retrieval failed or timed out:', error);
      
      // Return partial results if available
      const partialResults: RetrievalResults = {
        guidelines: [],
        pubmed: [],
        dailymed: [],
        clinical_trials: [],
        cochrane: [],
        bmj: [],
        nice: [],
        who: [],
        cdc: [],
        landmark_trials: [],
        semantic_scholar: [],
        europe_pmc: [],
        pmc: [],
        openalex: [],
        tavily: []
      };
      
      console.log('⚠️ Returning empty results due to intelligent retrieval failure/timeout');
      return partialResults;
    }
  }

  // Method to be called by Agent 5 if Tavily search needed
  async searchTavily(
    query: string,
    existingUrls: Set<string>,
    traceContext: TraceContext,
    originalQuery?: string
  ): Promise<any[]> {
    return this.tavily.search(query, existingUrls, traceContext, originalQuery);
  }
}