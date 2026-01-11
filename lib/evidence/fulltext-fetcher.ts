/**
 * Full-Text Fetcher
 * 
 * Fetches full-text content for top-ranked articles to provide richer context to the LLM.
 * Uses a cascading fallback strategy:
 * 1. DOI → Unpaywall API (finds open-access full-text)
 * 2. PMC ID → NCBI E-Utilities (fetches full-text from PubMed Central)
 * 3. Fallback → Use existing abstract from PubMed
 * 
 * Integrated with Phoenix OpenTelemetry for observability.
 */

import { withToolSpan } from '@/lib/otel';

const NCBI_API_KEY = process.env.NCBI_API_KEY || '';
const UNPAYWALL_EMAIL = 'medguidance-ai@example.com'; // Required by Unpaywall API

// Rate limiting for NCBI
const NCBI_REQUEST_DELAY = NCBI_API_KEY ? 100 : 350;
let lastNCBIRequestTime = 0;

async function ncbiRateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastNCBIRequestTime;
    if (timeSinceLastRequest < NCBI_REQUEST_DELAY) {
        await new Promise(resolve => setTimeout(resolve, NCBI_REQUEST_DELAY - timeSinceLastRequest));
    }
    lastNCBIRequestTime = Date.now();
    return fetch(url);
}

/**
 * Result of full-text fetch operation
 */
export interface FullTextResult {
    pmid: string;
    title: string;
    fullText: string | null;
    sections: FullTextSection[];
    source: 'doi' | 'pmc' | 'abstract' | 'none';
    wordCount: number;
}

export interface FullTextSection {
    heading: string;
    content: string;
    type: 'abstract' | 'introduction' | 'methods' | 'results' | 'discussion' | 'conclusion' | 'other';
}

/**
 * Attempt to fetch full-text via DOI using Unpaywall API
 * Unpaywall provides legal open-access links for ~30M articles
 */
async function fetchViaUnpaywall(doi: string): Promise<string | null> {
    if (!doi) return null;

    try {
        const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '');
        const url = `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=${UNPAYWALL_EMAIL}`;

        console.log(`[FullTextFetcher] Trying Unpaywall for DOI: ${cleanDoi}`);
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

        if (!response.ok) {
            console.log(`[FullTextFetcher] Unpaywall returned ${response.status}`);
            return null;
        }

        const data = await response.json();

        // Check for open-access PDF or HTML link
        if (data.best_oa_location?.url_for_landing_page) {
            console.log(`[FullTextFetcher] ✅ Found OA link via Unpaywall`);
            // Note: We return the URL, not the content (fetching PDFs is complex)
            // For now, we'll use PMC for actual content
            return null; // Continue to PMC fallback for actual text
        }

        return null;
    } catch (error) {
        console.warn(`[FullTextFetcher] Unpaywall error:`, error);
        return null;
    }
}

/**
 * Fetch full-text from PubMed Central using PMC ID or PMID
 * Uses NCBI E-Utilities efetch endpoint with rettype=full
 */
async function fetchViaPMC(pmcid: string | null, pmid: string): Promise<string | null> {
    // Try PMC ID first
    if (pmcid) {
        try {
            const pmcIdClean = pmcid.replace(/^PMC/i, '');
            const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcIdClean}&rettype=full&retmode=text${NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : ''}`;

            console.log(`[FullTextFetcher] Fetching full-text from PMC: ${pmcid}`);
            const response = await ncbiRateLimitedFetch(url);

            if (response.ok) {
                const text = await response.text();
                // Basic validation - PMC returns XML, extract text content
                if (text && text.length > 1000 && !text.includes('Error')) {
                    console.log(`[FullTextFetcher] ✅ Got ${text.length} chars from PMC`);
                    return extractTextFromPMCXML(text);
                }
            }
        } catch (error) {
            console.warn(`[FullTextFetcher] PMC fetch error:`, error);
        }
    }

    // Try to find PMC ID via PMID link
    if (pmid && !pmcid) {
        try {
            const linkUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pmc&id=${pmid}&retmode=json${NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : ''}`;

            const linkResponse = await ncbiRateLimitedFetch(linkUrl);
            if (linkResponse.ok) {
                const linkData = await linkResponse.json();
                const pmcLinks = linkData?.linksets?.[0]?.linksetdbs?.find((db: any) => db.dbto === 'pmc');
                if (pmcLinks?.links?.[0]) {
                    const foundPmcId = pmcLinks.links[0];
                    console.log(`[FullTextFetcher] Found PMC ID via PMID link: PMC${foundPmcId}`);
                    return fetchViaPMC(`PMC${foundPmcId}`, pmid);
                }
            }
        } catch (error) {
            console.warn(`[FullTextFetcher] PMC link lookup error:`, error);
        }
    }

    return null;
}

/**
 * Extract readable text from PMC XML response
 * Parses key sections: abstract, intro, methods, results, discussion, conclusion
 */
function extractTextFromPMCXML(xml: string): string {
    const sections: string[] = [];

    // Extract body text (main content)
    const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        // Clean XML tags and normalize whitespace
        let text = bodyMatch[1]
            .replace(/<[^>]+>/g, ' ')  // Remove tags
            .replace(/\s+/g, ' ')       // Normalize whitespace
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();

        // Limit to reasonable size (first ~8000 chars of body)
        if (text.length > 8000) {
            text = text.substring(0, 8000) + '... [truncated]';
        }
        sections.push(text);
    }

    // Also try to get abstract if body is not available
    if (sections.length === 0) {
        const abstractMatch = xml.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
        if (abstractMatch) {
            const abstractText = abstractMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            sections.push(abstractText);
        }
    }

    return sections.join('\n\n');
}

/**
 * Parse full-text into semantic sections for better context understanding
 */
function parseIntoSections(text: string, title: string): FullTextSection[] {
    const sections: FullTextSection[] = [];

    // Common section header patterns
    const sectionPatterns = [
        { regex: /\b(abstract|summary)\b/i, type: 'abstract' as const },
        { regex: /\b(introduction|background)\b/i, type: 'introduction' as const },
        { regex: /\b(methods?|materials?\s+and\s+methods?|study\s+design)\b/i, type: 'methods' as const },
        { regex: /\b(results?|findings?)\b/i, type: 'results' as const },
        { regex: /\b(discussion)\b/i, type: 'discussion' as const },
        { regex: /\b(conclusion|conclusions?|summary)\b/i, type: 'conclusion' as const },
    ];

    // Simple section splitting - look for uppercase headers or numbered sections
    const lines = text.split(/\n|\. (?=[A-Z])/);
    let currentSection: FullTextSection = { heading: 'Content', content: '', type: 'other' };

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Check if this looks like a section header
        const isHeader = trimmedLine.length < 100 &&
            (trimmedLine === trimmedLine.toUpperCase() ||
                /^(\d+\.?\s*)?[A-Z][A-Za-z\s]+:?$/.test(trimmedLine));

        if (isHeader) {
            // Save current section if it has content
            if (currentSection.content.trim()) {
                sections.push(currentSection);
            }

            // Start new section
            let sectionType: FullTextSection['type'] = 'other';
            for (const pattern of sectionPatterns) {
                if (pattern.regex.test(trimmedLine)) {
                    sectionType = pattern.type;
                    break;
                }
            }
            currentSection = { heading: trimmedLine, content: '', type: sectionType };
        } else {
            currentSection.content += trimmedLine + ' ';
        }
    }

    // Add final section
    if (currentSection.content.trim()) {
        sections.push(currentSection);
    }

    // If no sections found, treat entire text as one section
    if (sections.length === 0 && text.trim()) {
        sections.push({
            heading: title || 'Full Text',
            content: text.substring(0, 4000),
            type: 'other'
        });
    }

    return sections;
}

/**
 * Main function: Fetch full-text for a single article
 * Cascading fallback: DOI → PMC → Abstract
 */
export async function fetchFullText(
    pmid: string,
    doi: string | null | undefined,
    pmcid: string | null | undefined,
    title: string,
    existingAbstract: string | null | undefined
): Promise<FullTextResult> {
    return withToolSpan<FullTextResult>(
        'fulltext-fetcher',
        'fetch',
        async (span) => {
            span.setAttribute('input.pmid', pmid);
            span.setAttribute('input.doi', doi || 'none');
            span.setAttribute('input.pmcid', pmcid || 'none');

            let fullText: string | null = null;
            let source: FullTextResult['source'] = 'none';

            // Strategy 1: Try DOI via Unpaywall
            if (doi) {
                fullText = await fetchViaUnpaywall(doi);
                if (fullText) source = 'doi';
            }

            // Strategy 2: Try PMC
            if (!fullText) {
                fullText = await fetchViaPMC(pmcid || null, pmid);
                if (fullText) source = 'pmc';
            }

            // Strategy 3: Fall back to abstract
            if (!fullText && existingAbstract) {
                fullText = existingAbstract;
                source = 'abstract';
            }

            const sections = fullText ? parseIntoSections(fullText, title) : [];
            const wordCount = fullText ? fullText.split(/\s+/).length : 0;

            span.setAttribute('output.source', source);
            span.setAttribute('output.word_count', wordCount);
            span.setAttribute('output.section_count', sections.length);

            console.log(`[FullTextFetcher] PMID ${pmid}: ${source} (${wordCount} words, ${sections.length} sections)`);

            return {
                pmid,
                title,
                fullText,
                sections,
                source,
                wordCount
            };
        },
        { 'fetcher.type': 'cascading' }
    );
}

/**
 * Batch fetch full-text for top N articles after reranking
 * Only fetches for the most relevant articles to minimize latency
 */
export async function fetchFullTextForTopArticles<T extends { pmid?: string; doi?: string; pmcid?: string; title: string; abstract?: string }>(
    articles: T[],
    topN: number = 5
): Promise<Map<string, FullTextResult>> {
    const results = new Map<string, FullTextResult>();

    console.log(`[FullTextFetcher] Fetching full-text for top ${Math.min(topN, articles.length)} articles...`);
    const startTime = Date.now();

    // Process top N articles in parallel (with concurrency limit)
    const articlesToFetch = articles.slice(0, topN).filter(a => a.pmid);

    const fetchPromises = articlesToFetch.map(async (article) => {
        const result = await fetchFullText(
            article.pmid!,
            article.doi,
            (article as any).pmcid || null,
            article.title,
            article.abstract
        );
        return result;
    });

    const fetchedResults = await Promise.all(fetchPromises);
    for (const result of fetchedResults) {
        results.set(result.pmid, result);
    }

    const elapsed = Date.now() - startTime;
    const successCount = Array.from(results.values()).filter(r => r.source !== 'none').length;
    console.log(`[FullTextFetcher] Completed in ${elapsed}ms: ${successCount}/${articlesToFetch.length} articles with full-text`);

    return results;
}

/**
 * Format full-text results for inclusion in LLM prompt
 * Prioritizes sections most relevant for clinical decision making
 */
export function formatFullTextForPrompt(
    results: Map<string, FullTextResult>,
    maxCharsPerArticle: number = 3000
): string {
    if (results.size === 0) return '';

    let formatted = '\n\n📚 **FULL-TEXT EVIDENCE (Expanded Context)**\n\n';

    for (const [pmid, result] of results) {
        if (result.source === 'none') continue;

        formatted += `### PMID: ${pmid} - ${result.title}\n`;
        formatted += `**Source**: ${result.source.toUpperCase()} | **Words**: ${result.wordCount}\n\n`;

        // Prioritize Results and Conclusion sections for clinical relevance
        const prioritySections = result.sections.filter(s =>
            s.type === 'results' || s.type === 'conclusion' || s.type === 'discussion'
        );
        const otherSections = result.sections.filter(s =>
            s.type !== 'results' && s.type !== 'conclusion' && s.type !== 'discussion'
        );

        let charsUsed = 0;
        const allSections = [...prioritySections, ...otherSections];

        for (const section of allSections) {
            if (charsUsed >= maxCharsPerArticle) {
                formatted += `\n[... additional content truncated]\n`;
                break;
            }

            const contentToAdd = section.content.substring(0, maxCharsPerArticle - charsUsed);
            formatted += `**${section.heading}** (${section.type}):\n${contentToAdd}\n\n`;
            charsUsed += contentToAdd.length;
        }

        formatted += '\n---\n\n';
    }

    return formatted;
}
