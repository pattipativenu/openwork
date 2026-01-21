/**
 * Agent 2: Multi-Source Retrieval Coordinator
 * Orchestrates parallel retrieval from all required sources
 * FIXED: Now uses the comprehensive evidence engine (lib/evidence/)
 */

import { QueryAnalysis, EvidenceCandidate, TraceContext } from './types';
import { logRetrieval } from '../observability/arize-client';

// EVIDENCE ENGINE INTEGRATION - Use the comprehensive 57+ source system
import { comprehensivePubMedSearch } from '../evidence/pubmed';
import { comprehensiveDailyMedSearch } from '../evidence/dailymed';
import { comprehensiveCochraneSearch } from '../evidence/cochrane';
import { searchClinicalTrials } from '../evidence/clinical-trials';

// Sub-agent imports (only for guidelines - Firestore specific)
import { GuidelinesRetriever } from './sub-agents/guidelines-retriever';
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
  private tavily: TavilySmartSearch;

  constructor(config: {
    ncbi_api_key: string;
    tavily_api_key: string;
  }) {
    // Only initialize what's not in evidence engine
    this.guidelines = new GuidelinesRetriever();
    this.tavily = new TavilySmartSearch(config.tavily_api_key);
  }

  async retrieveAll(
    searchStrategy: QueryAnalysis,
    traceContext: TraceContext
  ): Promise<RetrievalResults> {
    const startTime = Date.now();
    const tasks: Promise<any>[] = [];
    const sources = searchStrategy.requires_sources;

    console.log(`🔍 Starting comprehensive evidence retrieval from 15+ sources...`);

    // 1. Guidelines (Firestore - Indian guidelines)
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

    // 2. PubMed (Evidence Engine - Advanced with MeSH)
    if (sources.pubmed) {
      tasks.push(
        comprehensivePubMedSearch(
          searchStrategy.search_variants.join(' OR '),
          false, // isGuidelineQuery
          [] // guidelineBodies
        ).then(results => ({ type: 'pubmed', results: results.articles }))
      );
    } else {
      tasks.push(Promise.resolve({ type: 'pubmed', results: [] }));
    }

    // 3. DailyMed (Evidence Engine - Advanced SPL parsing)
    if (sources.dailymed && searchStrategy.entities.drugs.length > 0) {
      tasks.push(
        comprehensiveDailyMedSearch(
          searchStrategy.entities.drugs.join(' OR ')
        ).then(results => ({ type: 'dailymed', results: results.drugs }))
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

    // Execute all tasks in parallel
    console.log(`⚡ Executing ${tasks.length} parallel searches...`);
    const results = await Promise.all(tasks);
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

    // Log comprehensive retrieval metrics
    const totalResults = Object.values(organizedResults).reduce((sum, arr) => sum + arr.length, 0);
    
    await logRetrieval(
      'comprehensive_multi_source',
      traceContext,
      searchStrategy.search_variants.join(' | '),
      totalResults,
      totalLatency,
      {
        guidelines_count: organizedResults.guidelines.length,
        pubmed_count: organizedResults.pubmed.length,
        dailymed_count: organizedResults.dailymed.length,
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
        sources_used: Object.keys(sources).filter(k => sources[k as keyof typeof sources]).length
      }
    );

    console.log(`✅ Comprehensive evidence retrieval complete: ${totalResults} documents in ${totalLatency}ms`);
    console.log(`   📚 Guidelines: ${organizedResults.guidelines.length}`);
    console.log(`   🔬 PubMed: ${organizedResults.pubmed.length}`);
    console.log(`   💊 DailyMed: ${organizedResults.dailymed.length}`);
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