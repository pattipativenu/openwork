/**
 * Sub-Agent 2.2: PubMed Intelligence
 * Multi-variant PubMed search with MeSH expansion and Medical Source Bible integration
 * ENHANCED: Now uses comprehensive evidence engine + specialty-specific journal filtering
 */

import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';
// EVIDENCE ENGINE INTEGRATION
import { comprehensivePubMedSearch } from '../../evidence/pubmed';
// MEDICAL SOURCE BIBLE INTEGRATION
import { 
  routeQueryToSpecialties, 
  getPubMedEliteFilter, 
  MEDICAL_SPECIALTIES,
  TIER_1_GENERAL_JOURNALS 
} from '../../../medical-source-bible';

export interface PubMedSearchResult {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  pub_date: string;
  pub_types: string[];
  doi?: string;
  pmcid?: string;
  full_text_available: boolean;
  specialty_relevance?: string[];
  journal_tier?: 'tier_1' | 'specialty_elite' | 'standard';
}

export class PubMedIntelligence {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    searchVariants: string[],
    entities: { diseases: string[]; drugs: string[]; procedures: string[] },
    traceContext: TraceContext,
    originalQuery?: string
  ): Promise<PubMedSearchResult[]> {
    const startTime = Date.now();
    
    try {
      console.log(`🔬 PubMed Intelligence: Enhanced search with Medical Source Bible integration`);
      
      // STEP 1: Route query to medical specialties using Medical Source Bible
      const relevantSpecialties = originalQuery ? routeQueryToSpecialties(originalQuery) : [];
      console.log(`📋 Detected specialties: ${relevantSpecialties.join(', ') || 'general'}`);
      
      // STEP 2: Get specialty-specific journal filters
      const eliteJournalFilter = relevantSpecialties.length > 0 
        ? getPubMedEliteFilter(relevantSpecialties)
        : TIER_1_GENERAL_JOURNALS.pubmed_combined_filter;
      
      console.log(`🎯 Using elite journal filter for specialties: ${relevantSpecialties.join(', ')}`);
      
      // STEP 3: Use comprehensive evidence engine for each search variant
      const allResults: any[] = [];
      
      for (const variant of searchVariants) {
        try {
          // Use evidence engine's comprehensive PubMed search
          const result = await comprehensivePubMedSearch(
            variant,
            false, // isGuidelineQuery - let the engine decide
            [] // guidelineBodies - will be auto-detected
          );
          
          // Combine all result types
          allResults.push(...result.articles);
          allResults.push(...result.systematicReviews);
          allResults.push(...result.guidelines);
          
        } catch (error) {
          console.warn(`⚠️ Search variant failed: ${variant}`, error);
        }
      }
      
      // STEP 4: Enhance results with Medical Source Bible metadata
      const enhancedResults = this.enhanceWithSourceBible(allResults, relevantSpecialties);
      
      // STEP 5: Apply intelligent filtering and ranking
      const filteredResults = this.applyIntelligentFiltering(enhancedResults, relevantSpecialties);
      
      const latency = Date.now() - startTime;

      await logRetrieval(
        'pubmed_intelligence',
        traceContext,
        searchVariants.join(' | '),
        filteredResults.length,
        latency,
        {
          variants_searched: searchVariants.length,
          specialties_detected: relevantSpecialties,
          total_results: allResults.length,
          after_filtering: filteredResults.length,
          tier_1_journals: filteredResults.filter(r => r.journal_tier === 'tier_1').length,
          specialty_elite: filteredResults.filter(r => r.journal_tier === 'specialty_elite').length,
          pmc_available: filteredResults.filter(r => r.pmcid).length
        }
      );

      console.log(`✅ PubMed Intelligence: ${filteredResults.length} articles (${filteredResults.filter(r => r.journal_tier === 'tier_1').length} Tier 1, ${filteredResults.filter(r => r.journal_tier === 'specialty_elite').length} Specialty Elite)`);
      return filteredResults;

    } catch (error) {
      console.error('❌ PubMed Intelligence failed:', error);
      
      await logRetrieval(
        'pubmed_intelligence',
        traceContext,
        searchVariants.join(' | '),
        0,
        Date.now() - startTime,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );

      return [];
    }
  }

  private enhanceWithSourceBible(results: any[], specialties: string[]): PubMedSearchResult[] {
    return results.map(article => {
      const journal = article.journal || '';
      let journalTier: 'tier_1' | 'specialty_elite' | 'standard' = 'standard';
      
      // Check if it's a Tier 1 general journal
      const isTier1 = TIER_1_GENERAL_JOURNALS.journals.some(j => 
        journal.toLowerCase().includes(j.abbreviation.toLowerCase()) ||
        journal.toLowerCase().includes(j.name.toLowerCase())
      );
      
      if (isTier1) {
        journalTier = 'tier_1';
      } else {
        // Check if it's a specialty elite journal
        for (const specialtyId of specialties) {
          const specialty = MEDICAL_SPECIALTIES.find(s => s.id === specialtyId);
          if (specialty) {
            const isSpecialtyElite = specialty.top_journals.some(j =>
              journal.toLowerCase().includes(j.abbreviation.toLowerCase()) ||
              journal.toLowerCase().includes(j.name.toLowerCase())
            );
            if (isSpecialtyElite) {
              journalTier = 'specialty_elite';
              break;
            }
          }
        }
      }
      
      return {
        pmid: article.pmid || article.id,
        title: article.title,
        abstract: article.abstract || '',
        authors: Array.isArray(article.authors) ? article.authors : 
                 typeof article.authors === 'string' ? [article.authors] : [],
        journal: journal,
        pub_date: article.pub_date || article.publicationDate || '',
        pub_types: article.pub_types || article.publicationTypes || [],
        doi: article.doi,
        pmcid: article.pmcid,
        full_text_available: !!article.pmcid,
        specialty_relevance: specialties,
        journal_tier: journalTier
      };
    });
  }

  private applyIntelligentFiltering(results: PubMedSearchResult[], specialties: string[]): PubMedSearchResult[] {
    // Sort by journal tier and recency
    const sorted = results.sort((a, b) => {
      // First priority: Journal tier
      const tierPriority = { 'tier_1': 3, 'specialty_elite': 2, 'standard': 1 };
      const tierDiff = tierPriority[b.journal_tier || 'standard'] - tierPriority[a.journal_tier || 'standard'];
      if (tierDiff !== 0) return tierDiff;
      
      // Second priority: Publication date (more recent first)
      const dateA = new Date(a.pub_date || '1900-01-01').getTime();
      const dateB = new Date(b.pub_date || '1900-01-01').getTime();
      return dateB - dateA;
    });
    
    // Apply intelligent limits based on journal tiers
    const tier1Articles = sorted.filter(r => r.journal_tier === 'tier_1').slice(0, 15);
    const specialtyEliteArticles = sorted.filter(r => r.journal_tier === 'specialty_elite').slice(0, 20);
    const standardArticles = sorted.filter(r => r.journal_tier === 'standard').slice(0, 15);
    
    // Combine and deduplicate
    const combined = [...tier1Articles, ...specialtyEliteArticles, ...standardArticles];
    const seen = new Set<string>();
    const deduped = combined.filter(article => {
      if (seen.has(article.pmid)) return false;
      seen.add(article.pmid);
      return true;
    });
    
    return deduped.slice(0, 50); // Final limit
  }
}