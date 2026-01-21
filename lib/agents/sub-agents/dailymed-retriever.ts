/**
 * Sub-Agent 2.4: DailyMed Retriever
 * Fetches FDA drug labels (SPL format)
 * Only triggered if requires_sources.dailymed == true
 */

import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';
import { DAILYMED_RETRIEVER_SYSTEM_PROMPT } from '../system-prompts/dailymed-retriever-prompt';

export interface DailyMedSearchResult {
  setid: string;
  drug_name: string;
  title: string;
  published: string;
  sections: Record<string, string>;
}

export class DailyMedRetriever {
  private systemPrompt: string;

  constructor() {
    this.systemPrompt = DAILYMED_RETRIEVER_SYSTEM_PROMPT;
  }

  async search(
    drugNames: string[],
    traceContext: TraceContext
  ): Promise<DailyMedSearchResult[]> {
    const startTime = Date.now();
    
    try {
      const results: DailyMedSearchResult[] = [];

      for (const drug of drugNames) {
        const drugResults = await this.searchDrug(drug);
        results.push(...drugResults.slice(0, 2)); // Max 2 per drug
      }

      const latency = Date.now() - startTime;

      await logRetrieval(
        'dailymed',
        traceContext,
        drugNames.join(', '),
        results.length,
        latency,
        {
          drugs_searched: drugNames.length,
          labels_found: results.length
        }
      );

      console.log(`💊 DailyMed search: ${results.length} drug labels found`);
      return results;

    } catch (error) {
      console.error('❌ DailyMed search failed:', error);
      
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

  private async searchDrug(drugName: string): Promise<DailyMedSearchResult[]> {
    const url = 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json';
    const params = new URLSearchParams({
      drug_name: drugName,
      published_after: '2020-01-01' // Recent labels only
    });

    try {
      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const results: DailyMedSearchResult[] = [];

      for (const spl of (data.data || []).slice(0, 2)) { // Max 2 per drug
        const sections = await this.fetchSPLSections(spl.setid);
        
        results.push({
          setid: spl.setid,
          drug_name: drugName,
          title: spl.title || '',
          published: spl.published || '',
          sections
        });
      }

      return results;

    } catch (error) {
      console.error(`❌ DailyMed search failed for ${drugName}:`, error);
      return [];
    }
  }

  private async fetchSPLSections(setid: string): Promise<Record<string, string>> {
    const url = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${setid}.xml`;

    try {
      const response = await fetch(url);
      const xmlContent = await response.text();

      const sections: Record<string, string> = {};

      // Extract key sections using LOINC codes (simplified approach)
      const sectionMappings = {
        '34067-9': 'indications',
        '34068-7': 'dosage',
        '43685-7': 'warnings',
        '34084-4': 'adverse_reactions',
        '34073-7': 'drug_interactions',
        '34090-1': 'clinical_pharmacology'
      };

      for (const [code, name] of Object.entries(sectionMappings)) {
        const regex = new RegExp(`code="${code}"[^>]*>(.*?)</[^>]*>`, 'gs');
        const match = xmlContent.match(regex);
        
        if (match && match[0]) {
          // Extract text content (remove XML tags)
          const textContent = match[0].replace(/<[^>]*>/g, ' ').trim();
          if (textContent.length > 20) {
            sections[name] = textContent.substring(0, 2000); // Limit length
          }
        }
      }

      return sections;

    } catch (error) {
      console.error(`❌ SPL fetch failed for ${setid}:`, error);
      return {};
    }
  }
}