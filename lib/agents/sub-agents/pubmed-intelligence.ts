/**
 * Sub-Agent 2.2: PubMed Intelligence
 * Multi-variant PubMed search with MeSH expansion
 */

import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';

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
}

export class PubMedIntelligence {
  private apiKey: string;
  private baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private rateLimitDelay = 100; // 10 req/sec

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    searchVariants: string[],
    entities: { diseases: string[]; drugs: string[]; procedures: string[] },
    traceContext: TraceContext
  ): Promise<PubMedSearchResult[]> {
    const startTime = Date.now();
    
    try {
      const allPmids = new Set<string>();
      const searchPromises: Promise<string[]>[] = [];

      // Build and execute searches for each variant
      for (const variant of searchVariants) {
        const pubmedQuery = this.buildPubMedQuery(variant, entities);
        searchPromises.push(this.esearch(pubmedQuery));
      }

      // Execute all searches in parallel
      const results = await Promise.all(searchPromises);
      
      // Combine and deduplicate PMIDs
      for (const pmidList of results) {
        pmidList.forEach(pmid => allPmids.add(pmid));
      }

      // Cap at 100 PMIDs and fetch metadata
      const pmidsList = Array.from(allPmids).slice(0, 100);
      const articles = await this.fetchMetadata(pmidsList);
      
      // Check PMC availability
      const articlesWithPMC = await this.checkPMCAvailability(articles);

      const latency = Date.now() - startTime;

      await logRetrieval(
        'pubmed',
        traceContext,
        searchVariants.join(' | '),
        articlesWithPMC.length,
        latency,
        {
          variants_searched: searchVariants.length,
          total_pmids_found: allPmids.size,
          after_dedup: pmidsList.length,
          pmc_available: articlesWithPMC.filter(a => a.pmcid).length
        }
      );

      console.log(`🔬 PubMed search: ${articlesWithPMC.length} articles, ${articlesWithPMC.filter(a => a.pmcid).length} with full-text`);
      return articlesWithPMC;

    } catch (error) {
      console.error('❌ PubMed search failed:', error);
      
      await logRetrieval(
        'pubmed',
        traceContext,
        searchVariants.join(' | '),
        0,
        Date.now() - startTime,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );

      return [];
    }
  }

  private buildPubMedQuery(variant: string, entities: { diseases: string[]; drugs: string[]; procedures: string[] }): string {
    const queryParts: string[] = [];

    // Add disease MeSH terms
    for (const disease of entities.diseases) {
      queryParts.push(`("${disease}"[MeSH Terms] OR "${disease}"[Title/Abstract])`);
    }

    // Add drug terms
    for (const drug of entities.drugs) {
      queryParts.push(`("${drug}"[MeSH Terms] OR "${drug}"[Title/Abstract])`);
    }

    // Add variant as free text
    queryParts.push(`"${variant}"`);

    // Combine with AND
    const baseQuery = queryParts.join(' AND ');

    // Add publication type filters
    const filters = [
      '("Meta-Analysis"[PT] OR "Randomized Controlled Trial"[PT] OR "Systematic Review"[PT] OR "Practice Guideline"[PT])',
      '"2015/01/01"[PDAT] : "3000"[PDAT]', // Last 10 years
      'english[LA]',
      'hasabstract'
    ];

    return `(${baseQuery}) AND ${filters.join(' AND ')}`;
  }

  private async esearch(query: string): Promise<string[]> {
    const url = `${this.baseUrl}/esearch.fcgi`;
    const params = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmax: '50', // 50 per variant
      retmode: 'json',
      sort: 'relevance',
      api_key: this.apiKey
    });

    try {
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();
      return data.esearchresult?.idlist || [];
    } catch (error) {
      console.error('❌ ESearch failed:', error);
      return [];
    }
  }

  private async fetchMetadata(pmids: string[]): Promise<PubMedSearchResult[]> {
    if (pmids.length === 0) return [];

    const url = `${this.baseUrl}/esummary.fcgi`;
    const params = new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'json',
      api_key: this.apiKey
    });

    try {
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();

      const articles: PubMedSearchResult[] = [];
      
      for (const pmid of pmids) {
        if (data.result?.[pmid]) {
          const articleData = data.result[pmid];
          
          // Extract authors
          const authors = (articleData.authors || [])
            .slice(0, 3)
            .map((author: any) => author.name);

          articles.push({
            pmid,
            title: articleData.title || '',
            abstract: articleData.abstract || '', // May be truncated
            authors,
            journal: articleData.fulljournalname || '',
            pub_date: articleData.pubdate || '',
            pub_types: articleData.pubtype || [],
            doi: articleData.elocationid?.replace('doi: ', ''),
            pmcid: undefined, // Will be set in next step
            full_text_available: false
          });
        }
      }

      return articles;
    } catch (error) {
      console.error('❌ ESummary failed:', error);
      return [];
    }
  }

  private async checkPMCAvailability(articles: PubMedSearchResult[]): Promise<PubMedSearchResult[]> {
    if (articles.length === 0) return articles;

    const pmids = articles.map(a => a.pmid);
    const url = `${this.baseUrl}/elink.fcgi`;
    const params = new URLSearchParams({
      dbfrom: 'pubmed',
      db: 'pmc',
      id: pmids.join(','),
      retmode: 'json',
      api_key: this.apiKey
    });

    try {
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();

      // Map PMID → PMCID
      const pmidToPmcid: Record<string, string> = {};
      
      for (const linkset of data.linksets || []) {
        if (linkset.linksetdbs) {
          for (const db of linkset.linksetdbs) {
            if (db.dbto === 'pmc' && db.links?.length > 0) {
              const pmid = linkset.ids[0];
              const pmcid = db.links[0];
              if (pmcid) {
                pmidToPmcid[pmid] = `PMC${pmcid}`;
              }
            }
          }
        }
      }

      // Update articles with PMCID
      return articles.map(article => ({
        ...article,
        pmcid: pmidToPmcid[article.pmid],
        full_text_available: !!pmidToPmcid[article.pmid]
      }));

    } catch (error) {
      console.error('❌ ELink failed:', error);
      return articles;
    }
  }
}