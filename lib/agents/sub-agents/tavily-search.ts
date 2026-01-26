/**
 * Sub-Agent 2.5: Tavily Smart Search
 * Searches recent web content when evidence gaps detected
 * ENHANCED: Now uses Medical Source Bible for specialty-specific domain targeting
 */

import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';
import { TAVILY_SEARCH_SYSTEM_PROMPT } from '../system-prompts/tavily-search-prompt';
// MEDICAL SOURCE BIBLE INTEGRATION
import { 
  routeQueryToSpecialties, 
  getTavilyDomains, 
  buildGuidelineSearchQuery,
  MEDICAL_SPECIALTIES 
} from '../../../medical-source-bible';

export interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
  published_date?: string;
  specialty_relevance?: string[];
  source_type?: 'guideline_org' | 'journal' | 'government' | 'medical_institution';
}

export class TavilySmartSearch {
  private apiKey: string;
  private systemPrompt: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.systemPrompt = TAVILY_SEARCH_SYSTEM_PROMPT;
  }

  async search(
    query: string,
    existingUrls: Set<string>,
    traceContext: TraceContext,
    originalQuery?: string
  ): Promise<TavilySearchResult[]> {
    const startTime = Date.now();

    if (!this.apiKey) {
      console.log('⚠️ Tavily API key not configured, skipping web search');
      return [];
    }

    try {
      console.log(`🌐 Tavily Smart Search: Enhanced with Medical Source Bible domain targeting`);
      
      // STEP 1: Route query to medical specialties using Medical Source Bible
      const relevantSpecialties = originalQuery ? routeQueryToSpecialties(originalQuery) : [];
      console.log(`📋 Detected specialties for domain targeting: ${relevantSpecialties.join(', ') || 'general'}`);
      
      // STEP 2: Get specialty-specific domains from Medical Source Bible
      const targetDomains = relevantSpecialties.length > 0 
        ? getTavilyDomains(relevantSpecialties)
        : this.getGeneralMedicalDomains();
      
      console.log(`🎯 Targeting ${targetDomains.length} specialty domains: ${targetDomains.slice(0, 5).join(', ')}${targetDomains.length > 5 ? '...' : ''}`);
      
      // STEP 3: Build specialty-aware search query
      const enhancedQuery = relevantSpecialties.length > 0 
        ? buildGuidelineSearchQuery(query, relevantSpecialties)
        : query;
      
      console.log(`🔍 Enhanced query: "${enhancedQuery}"`);

      // STEP 4: Execute Tavily search with specialty domains
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          query: enhancedQuery,
          search_depth: 'advanced',
          max_results: 15,
          include_domains: targetDomains,
          exclude_domains: [
            'wikipedia.org', 'reddit.com', 'quora.com',
            'facebook.com', 'twitter.com', 'youtube.com'
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json();
      const rawResults = data.results || [];
      
      // STEP 5: Enhance results with Medical Source Bible metadata
      const enhancedResults = this.enhanceWithSourceBible(rawResults, relevantSpecialties, existingUrls);
      
      // STEP 6: Apply intelligent filtering for medical relevance
      const filteredResults = this.applyMedicalFiltering(enhancedResults);

      const latency = Date.now() - startTime;

      await logRetrieval(
        'tavily',
        traceContext,
        query,
        filteredResults.length,
        latency,
        {
          specialties_detected: relevantSpecialties,
          domains_targeted: targetDomains.length,
          total_results: rawResults.length,
          deduped_results: filteredResults.length,
          guideline_orgs: filteredResults.filter(r => r.source_type === 'guideline_org').length,
          government_sources: filteredResults.filter(r => r.source_type === 'government').length,
          query_type: 'specialty_targeted_search'
        }
      );

      console.log(`✅ Tavily Smart Search: ${filteredResults.length} new sources (${filteredResults.filter(r => r.source_type === 'guideline_org').length} guideline orgs, ${filteredResults.filter(r => r.source_type === 'government').length} government)`);
      return filteredResults;

    } catch (error) {
      console.error('❌ Tavily Smart Search failed:', error);
      
      await logRetrieval(
        'tavily',
        traceContext,
        query,
        0,
        Date.now() - startTime,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );

      return [];
    }
  }

  private enhanceWithSourceBible(results: any[], specialties: string[], existingUrls: Set<string>): TavilySearchResult[] {
    return results
      .filter((result: any) => !existingUrls.has(result.url)) // Deduplicate
      .map((result: any) => {
        const sourceType = this.classifySourceType(result.url, specialties);
        
        return {
          url: result.url,
          title: result.title,
          content: result.content,
          score: result.score || 0.7,
          published_date: result.published_date,
          specialty_relevance: specialties,
          source_type: sourceType
        };
      });
  }

  private classifySourceType(url: string, specialties: string[]): 'guideline_org' | 'journal' | 'government' | 'medical_institution' {
    const urlLower = url.toLowerCase();
    
    // Check if it's a guideline organization from Medical Source Bible
    for (const specialtyId of specialties) {
      const specialty = MEDICAL_SPECIALTIES.find(s => s.id === specialtyId);
      if (specialty) {
        for (const org of specialty.guideline_organizations) {
          if (urlLower.includes(org.website.toLowerCase())) {
            return 'guideline_org';
          }
        }
      }
    }
    
    // Government sources
    if (urlLower.includes('cdc.gov') || urlLower.includes('who.int') || 
        urlLower.includes('nih.gov') || urlLower.includes('fda.gov') ||
        urlLower.includes('nice.org.uk') || urlLower.includes('nhs.uk')) {
      return 'government';
    }
    
    // Medical journals
    if (urlLower.includes('nejm.org') || urlLower.includes('thelancet.com') ||
        urlLower.includes('jamanetwork.com') || urlLower.includes('bmj.com') ||
        urlLower.includes('nature.com') || urlLower.includes('pubmed')) {
      return 'journal';
    }
    
    // Medical institutions
    if (urlLower.includes('mayoclinic.org') || urlLower.includes('clevelandclinic.org') ||
        urlLower.includes('hopkinsmedicine.org') || urlLower.includes('mskcc.org')) {
      return 'medical_institution';
    }
    
    return 'medical_institution'; // Default
  }

  private applyMedicalFiltering(results: TavilySearchResult[]): TavilySearchResult[] {
    // Sort by source type priority and score
    const sorted = results.sort((a, b) => {
      // First priority: Source type
      const typePriority = { 
        'guideline_org': 4, 
        'government': 3, 
        'journal': 2, 
        'medical_institution': 1 
      };
      const typeDiff = typePriority[b.source_type || 'medical_institution'] - typePriority[a.source_type || 'medical_institution'];
      if (typeDiff !== 0) return typeDiff;
      
      // Second priority: Score
      return (b.score || 0) - (a.score || 0);
    });
    
    // Apply limits by source type
    const guidelineOrgs = sorted.filter(r => r.source_type === 'guideline_org').slice(0, 8);
    const government = sorted.filter(r => r.source_type === 'government').slice(0, 6);
    const journals = sorted.filter(r => r.source_type === 'journal').slice(0, 4);
    const institutions = sorted.filter(r => r.source_type === 'medical_institution').slice(0, 4);
    
    // Combine and deduplicate by URL
    const combined = [...guidelineOrgs, ...government, ...journals, ...institutions];
    const seen = new Set<string>();
    const deduped = combined.filter(result => {
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    });
    
    return deduped.slice(0, 20); // Final limit
  }

  private getGeneralMedicalDomains(): string[] {
    // Fallback domains when no specific specialties detected
    return [
      'cdc.gov', 'who.int', 'nih.gov', 'fda.gov',
      'mayoclinic.org', 'clevelandclinic.org', 'hopkinsmedicine.org',
      'nejm.org', 'thelancet.com', 'jamanetwork.com', 'bmj.com',
      'nice.org.uk', 'nhs.uk', 'uptodate.com', 'medscape.com'
    ];
  }
}