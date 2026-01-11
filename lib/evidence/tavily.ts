/**
 * Tavily AI Integration for Medical Evidence Search
 * 
 * This module provides a FALLBACK evidence source when our primary databases
 * return insufficient results. Tavily searches ONLY from trusted medical sources.
 * 
 * Key Features:
 * - Real-time search from 30+ trusted medical domains
 * - Structured results with citations and URLs
 * - Fallback only when internal evidence is insufficient
 * - Filters results to medical sources only
 * - Provides answer + citations for evidence synthesis
 * - OpenTelemetry tracing for observability (Arize Phoenix)
 */

import { withToolSpan } from '@/lib/otel';

// Environment variables - accessed at runtime
const getTavilyApiKey = () => (globalThis as any).process?.env?.TAVILY_API_KEY || "";
const TAVILY_API_URL = "https://api.tavily.com/search";

/**
 * Trusted medical domains that Tavily is allowed to search
 * Limited to top 30 most authoritative sources
 */
export const TRUSTED_MEDICAL_DOMAINS = [
  // Government Health Agencies
  "cdc.gov", "who.int", "nih.gov", "fda.gov", "cms.gov",

  // Medical Organizations
  "mayoclinic.org", "clevelandclinic.org", "hopkinsmedicine.org",
  "webmd.com", "healthline.com", "medlineplus.gov",

  // Academic & Research
  "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "cochranelibrary.com",
  "bmj.com", "nejm.org", "thelancet.com", "jamanetwork.com",

  // Professional Organizations
  "heart.org", "diabetes.org", "cancer.org", "kidney.org",
  "lung.org", "stroke.org", "arthritis.org",

  // International Health
  "nhs.uk", "nice.org.uk", "health.gov.au", "canada.ca",

  // Medical Education
  "uptodate.com", "medscape.com", "emedicine.medscape.com"
];

export interface TavilyCitation {
  url: string;
  title?: string;
  content?: string;
  score?: number;
  published_date?: string;
  pmid?: string;
}

export interface TavilySearchResult {
  answer: string;
  citations: TavilyCitation[];
  relatedQuestions?: string[];
  query: string;
  responseTime: number;
}

/**
 * Check if evidence is insufficient and Tavily fallback should be triggered
 * Based on quality and quantity of primary evidence
 */
export function shouldTriggerTavilyFallback(
  evidenceCounts: {
    guidelines: number;
    systematicReviews: number;
    trials: number;
    pubmedArticles: number;
    cochraneReviews: number;
  }
): boolean {
  const { guidelines, systematicReviews, trials, pubmedArticles, cochraneReviews } = evidenceCounts;

  // High-quality evidence sources
  const highQualityCount = guidelines + systematicReviews + cochraneReviews;
  const totalEvidence = highQualityCount + trials + pubmedArticles;

  // Trigger Tavily if:
  // 1. Very low high-quality evidence (< 2 guidelines/reviews)
  // 2. Low total evidence (< 5 sources)
  // 3. No guidelines AND no systematic reviews
  const shouldTrigger =
    highQualityCount < 2 ||
    totalEvidence < 5 ||
    (guidelines === 0 && systematicReviews === 0 && cochraneReviews === 0);

  if (shouldTrigger) {
    console.log(`📡 Tavily fallback triggered: ${highQualityCount} high-quality, ${totalEvidence} total evidence items`);
  }

  return shouldTrigger;
}

/**
 * Build the medical search prompt for Tavily
 */
function buildMedicalSearchPrompt(query: string): string {
  return `Provide evidence-based medical information about: ${query}

Focus on:
- Clinical guidelines from major medical organizations
- Systematic reviews and meta-analyses
- Randomized controlled trials
- Evidence-based treatment recommendations
- Diagnostic criteria and clinical decision-making

Include specific citations, study names, and publication details when available.`;
}

/**
 * Search Tavily for medical evidence
 * Only searches from trusted medical domains
 * Instrumented with OpenTelemetry for observability
 */
export async function searchTavilyMedical(
  query: string,
  options: {
    maxResults?: number;
    includeDomains?: string[];
  } = {}
): Promise<TavilySearchResult> {
  const { maxResults = 10, includeDomains = TRUSTED_MEDICAL_DOMAINS } = options;

  // Early return if no API key (not traced)
  if (!getTavilyApiKey()) {
    console.warn("⚠️ TAVILY_API_KEY not set, skipping Tavily search");
    return {
      answer: "",
      citations: [],
      query,
      responseTime: 0,
    };
  }

  // Wrap the actual search in a traced span
  return withToolSpan<TavilySearchResult>(
    'tavily',
    'search',
    async (span) => {
      const startTime = Date.now();

      console.log("🔍 Tavily: Searching trusted medical sources...");
      console.log(`   Query: "${query.substring(0, 100)}..."`);

      // Set input attributes for the span
      span.setAttribute('input.query', query.substring(0, 500));
      span.setAttribute('input.max_results', maxResults);

      try {
        // Truncate query to prevent Tavily 400-char limit error
        const truncatedQuery = query.length > 350 ? query.substring(0, 347) + '...' : query;

        const response = await fetch(TAVILY_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${getTavilyApiKey()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: truncatedQuery, // Use truncated query directly, skip verbose prompt
            search_depth: "advanced",
            include_answer: true,
            include_raw_content: false,
            max_results: maxResults,
            include_domains: includeDomains,
            exclude_domains: [
              // Exclude non-medical or unreliable sources
              "wikipedia.org", "reddit.com", "quora.com",
              "facebook.com", "twitter.com", "youtube.com"
            ]
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Tavily API error: ${response.status}`, errorText);
          throw new Error(`Tavily API error: ${response.status}`);
        }

        const data = await response.json();
        const responseTime = Date.now() - startTime;

        // Extract answer and results
        const answer = data.answer || "";
        const rawResults = data.results || [];

        console.log(`✅ Tavily: Found ${rawResults.length} results`);

        // Process and validate citations
        const citations: TavilyCitation[] = rawResults
          .slice(0, maxResults)
          .map((result: { url: string; title?: string; content?: string; score?: number; published_date?: string }) => {
            return {
              url: result.url,
              title: result.title,
              content: result.content?.substring(0, 500), // Limit content length
              score: result.score,
              published_date: result.published_date,
            };
          })
          // Filter to only include citations from trusted sources
          .filter((cite: TavilyCitation) => {
            const isTrusted = TRUSTED_MEDICAL_DOMAINS.some(domain =>
              cite.url.toLowerCase().includes(domain.toLowerCase())
            );

            if (!isTrusted) {
              console.log(`⚠️ Tavily: Filtered out non-medical source: ${cite.url}`);
            }

            return isTrusted;
          });

        console.log(`✅ Tavily: ${citations.length} trusted medical citations after filtering`);

        // Set output attributes for the span
        span.setAttribute('output.citation_count', citations.length);
        span.setAttribute('output.response_time_ms', responseTime);
        span.setAttribute('output.has_answer', answer.length > 0);

        // Store citation URLs for eval (truncated)
        const citationUrls = citations.slice(0, 5).map(c => c.url).join(', ');
        span.setAttribute('output.citation_urls', citationUrls);

        return {
          answer,
          citations,
          query,
          responseTime,
        };

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("❌ Tavily search failed:", errorMessage);
        return {
          answer: "",
          citations: [],
          query,
          responseTime: Date.now() - startTime,
        };
      }
    },
    { 'input.query': query.substring(0, 200) }
  );
}

/**
 * Enrich citations with PMID lookup (future enhancement)
 */
export async function enrichCitationsWithPMID(
  citations: TavilyCitation[]
): Promise<TavilyCitation[]> {
  // For now, return as-is. In future, we can add PubMed title lookup
  // to find PMIDs for citations that only have URLs
  return citations;
}

/**
 * Format Tavily results for inclusion in evidence prompt
 * 
 * IMPORTANT: Tavily is just a search engine - we credit the ACTUAL SOURCES
 * (Mayo Clinic, CDC, WHO, PubMed, etc.), NOT Tavily itself.
 * 
 * Think of Tavily like a librarian who finds books from different publishers.
 * We credit the publishers (sources), not the librarian (Tavily).
 */
export function formatTavilyForPrompt(result: TavilySearchResult): string {
  if (!result.answer || result.citations.length === 0) {
    return "";
  }

  // Don't mention "Tavily" - just present as additional medical sources
  let formatted = "\n\n## ZONE 0: ADDITIONAL MEDICAL SOURCES\n";
  formatted += "**Supplementary evidence from trusted medical websites**\n\n";

  if (result.answer) {
    result.citations.forEach((cite, i) => {
      const refNum = i + 1;
      // Get the actual source name (Mayo Clinic, CDC, etc.) - NOT "Tavily"
      const sourceInfo = extractSourceInfo(cite.url);
      const title = cite.title || sourceInfo.title;

      formatted += `${refNum}. **${title}**\n`;
      formatted += `   URL: ${cite.url}\n`;
      // Use the actual source (Mayo Clinic, CDC, WHO, etc.) - NOT "Tavily"
      formatted += `   SOURCE: ${sourceInfo.sourceName}`;
      if (cite.pmid) formatted += ` | PMID: ${cite.pmid}`;
      if (cite.published_date) formatted += ` | Date: ${cite.published_date}`;
      formatted += `\n\n`;
    });
  }

  return formatted;
}

/**
 * Extract source information from a URL
 * Returns the actual source name (Mayo Clinic, CDC, etc.) - NOT "Tavily"
 */
function extractSourceInfo(url: string): { sourceName: string; title: string } {
  const hostname = new URL(url).hostname.toLowerCase();

  // Map domains to proper source names
  const sourceMap: { [key: string]: string } = {
    'cdc.gov': 'Centers for Disease Control and Prevention (CDC)',
    'who.int': 'World Health Organization (WHO)',
    'nih.gov': 'National Institutes of Health (NIH)',
    'fda.gov': 'U.S. Food and Drug Administration (FDA)',
    'mayoclinic.org': 'Mayo Clinic',
    'clevelandclinic.org': 'Cleveland Clinic',
    'hopkinsmedicine.org': 'Johns Hopkins Medicine',
    'webmd.com': 'WebMD',
    'healthline.com': 'Healthline',
    'medlineplus.gov': 'MedlinePlus (NLM)',
    'pubmed.ncbi.nlm.nih.gov': 'PubMed (NCBI)',
    'ncbi.nlm.nih.gov': 'National Center for Biotechnology Information (NCBI)',
    'cochranelibrary.com': 'Cochrane Library',
    'bmj.com': 'BMJ (British Medical Journal)',
    'nejm.org': 'New England Journal of Medicine',
    'thelancet.com': 'The Lancet',
    'jamanetwork.com': 'JAMA Network',
    'heart.org': 'American Heart Association',
    'diabetes.org': 'American Diabetes Association',
    'cancer.org': 'American Cancer Society',
    'nhs.uk': 'National Health Service (NHS)',
    'nice.org.uk': 'National Institute for Health and Care Excellence (NICE)',
    'uptodate.com': 'UpToDate',
    'medscape.com': 'Medscape',
  };

  // Find matching source
  for (const [domain, sourceName] of Object.entries(sourceMap)) {
    if (hostname.includes(domain)) {
      return {
        sourceName,
        title: `Medical information from ${sourceName}`,
      };
    }
  }

  // Default fallback
  return {
    sourceName: hostname,
    title: `Medical information from ${hostname}`,
  };
}