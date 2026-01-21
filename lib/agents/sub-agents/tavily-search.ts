/**
 * Sub-Agent 2.5: Tavily Smart Search
 * Searches recent web content when evidence gaps detected
 * Only called by Agent 5 if evidence gap detected
 */

import { TraceContext } from '../types';
import { logRetrieval } from '../../observability/arize-client';
import { TAVILY_SEARCH_SYSTEM_PROMPT } from '../system-prompts/tavily-search-prompt';

export interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
  published_date?: string;
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
    traceContext: TraceContext
  ): Promise<TavilySearchResult[]> {
    const startTime = Date.now();

    if (!this.apiKey) {
      console.log('⚠️ Tavily API key not configured, skipping web search');
      return [];
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          query,
          search_depth: 'advanced',
          max_results: 10,
          include_domains: [
            'nih.gov',
            'thelancet.com', 
            'nejm.org',
            'bmj.com',
            'jamanetwork.com',
            'nature.com',
            'sciencedirect.com'
          ],
          exclude_domains: ['wikipedia.org']
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json();
      const newResults: TavilySearchResult[] = [];

      for (const result of data.results || []) {
        const url = result.url;
        
        // Deduplicate against existing sources
        if (!existingUrls.has(url)) {
          newResults.push({
            url,
            title: result.title,
            content: result.content,
            score: result.score || 0.7,
            published_date: result.published_date
          });
          existingUrls.add(url);
        }
      }

      const latency = Date.now() - startTime;

      await logRetrieval(
        'tavily',
        traceContext,
        query,
        newResults.length,
        latency,
        {
          total_results: data.results?.length || 0,
          deduped_results: newResults.length,
          query_type: 'recent_evidence_gap'
        }
      );

      console.log(`🌐 Tavily search: ${newResults.length} new sources found`);
      return newResults;

    } catch (error) {
      console.error('❌ Tavily search failed:', error);
      
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
}