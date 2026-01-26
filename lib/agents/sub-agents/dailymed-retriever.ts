/**
 * Sub-Agent 2.4: DailyMed Retriever
 * Fetches FDA drug labels (SPL format)
 * ENHANCED: Now uses comprehensive evidence engine + Medical Source Bible drug routing
 */

import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';
import { DAILYMED_RETRIEVER_SYSTEM_PROMPT } from '../system-prompts/dailymed-retriever-prompt';
// EVIDENCE ENGINE INTEGRATION
import { comprehensiveDailyMedSearch } from '../../evidence/dailymed';
// MEDICAL SOURCE BIBLE INTEGRATION
import { routeQueryToSpecialties } from '../../../medical-source-bible';

export interface DailyMedSearchResult {
  setid: string;
  drug_name: string;
  title: string;
  published: string;
  sections: Record<string, string>;
  specialty_relevance?: string[];
  is_recent_update?: boolean;
}

export class DailyMedRetriever {
  private systemPrompt: string;

  constructor() {
    this.systemPrompt = DAILYMED_RETRIEVER_SYSTEM_PROMPT;
  }

  async search(
    drugNames: string[],
    traceContext: TraceContext,
    originalQuery?: string
  ): Promise<DailyMedSearchResult[]> {
    const startTime = Date.now();
    
    try {
      console.log(`💊 DailyMed Retriever: Enhanced search with Medical Source Bible integration`);
      
      // STEP 1: Route query to medical specialties for drug context
      const relevantSpecialties = originalQuery ? routeQueryToSpecialties(originalQuery) : [];
      console.log(`📋 Drug context specialties: ${relevantSpecialties.join(', ') || 'general'}`);

      // STEP 2: Use comprehensive evidence engine for drug search
      const searchQuery = drugNames.join(' OR ');
      const result = await comprehensiveDailyMedSearch(searchQuery);
      
      // STEP 3: Enhance results with Medical Source Bible metadata
      const enhancedResults = this.enhanceWithSourceBible(result.drugs, relevantSpecialties, drugNames);
      
      // STEP 4: Apply intelligent filtering for drug information
      const filteredResults = this.applyDrugFiltering(enhancedResults);

      const latency = Date.now() - startTime;

      await logRetrieval(
        'dailymed',
        traceContext,
        drugNames.join(', '),
        filteredResults.length,
        latency,
        {
          drugs_searched: drugNames.length,
          specialties_detected: relevantSpecialties,
          total_results: result.drugs.length,
          after_filtering: filteredResults.length,
          recent_updates: filteredResults.filter(r => r.is_recent_update).length,
          labels_found: filteredResults.length
        }
      );

      console.log(`✅ DailyMed Retriever: ${filteredResults.length} drug labels (${filteredResults.filter(r => r.is_recent_update).length} recent updates)`);
      return filteredResults;

    } catch (error) {
      console.error('❌ DailyMed Retriever failed:', error);
      
      await logRetrieval(
        'dailymed',
        traceContext,
        drugNames.join(', '),
        0,
        Date.now() - startTime,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );

      return [];
    }
  }

  private enhanceWithSourceBible(drugs: any[], specialties: string[], searchedDrugs: string[]): DailyMedSearchResult[] {
    return drugs.map(drug => {
      // Check if this is a recent update (2023+)
      const pubYear = new Date(drug.publishedDate || '2000-01-01').getFullYear();
      const currentYear = new Date().getFullYear();
      const isRecentUpdate = pubYear >= currentYear - 2; // 2023+ if current year is 2025

      // Extract sections from the drug object
      const sections: Record<string, string> = {};
      
      if (drug.indications) sections.indications = drug.indications;
      if (drug.contraindications) sections.contraindications = drug.contraindications;
      if (drug.warnings) sections.warnings = drug.warnings;
      if (drug.dosage) sections.dosage = drug.dosage;
      if (drug.adverseReactions) sections.adverse_reactions = drug.adverseReactions;
      if (drug.drugInteractions) sections.drug_interactions = drug.drugInteractions;
      if (drug.clinicalPharmacology) sections.clinical_pharmacology = drug.clinicalPharmacology;
      if (drug.howSupplied) sections.how_supplied = drug.howSupplied;

      return {
        setid: drug.setId,
        drug_name: drug.genericName || drug.brandName || searchedDrugs[0] || 'Unknown',
        title: drug.title,
        published: drug.publishedDate,
        sections,
        specialty_relevance: specialties,
        is_recent_update: isRecentUpdate
      };
    });
  }

  private applyDrugFiltering(results: DailyMedSearchResult[]): DailyMedSearchResult[] {
    // Sort by recency and completeness
    const sorted = results.sort((a, b) => {
      // First priority: Recent updates
      if (a.is_recent_update && !b.is_recent_update) return -1;
      if (!a.is_recent_update && b.is_recent_update) return 1;
      
      // Second priority: Number of sections (more complete information)
      const sectionsA = Object.keys(a.sections).length;
      const sectionsB = Object.keys(b.sections).length;
      if (sectionsA !== sectionsB) return sectionsB - sectionsA;
      
      // Third priority: Publication date (more recent first)
      const dateA = new Date(a.published || '1900-01-01').getTime();
      const dateB = new Date(b.published || '1900-01-01').getTime();
      return dateB - dateA;
    });
    
    // Apply limits: prioritize recent updates and complete information
    const recentUpdates = sorted.filter(r => r.is_recent_update).slice(0, 8);
    const olderLabels = sorted.filter(r => !r.is_recent_update).slice(0, 4);
    
    // Combine and deduplicate by setid
    const combined = [...recentUpdates, ...olderLabels];
    const seen = new Set<string>();
    const deduped = combined.filter(drug => {
      if (seen.has(drug.setid)) return false;
      seen.add(drug.setid);
      return true;
    });
    
    return deduped.slice(0, 12); // Final limit
  }
}