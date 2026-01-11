/**
 * BGE Cross-Encoder Reranker
 * 
 * Uses BAAI/bge-reranker-v2-m3 for high-accuracy re-ranking of search results.
 * This is a Cross-Encoder approach which is more accurate than Bi-Encoder (cosine similarity)
 * because it sees the query and document together in the attention mechanism.
 * 
 * Integrated with Phoenix OpenTelemetry for full observability.
 * 
 * Model: Xenova/bge-reranker-v2-m3 (or fallback to bge-reranker-base)
 * Runtime: @xenova/transformers (ONNX Runtime)
 */

import { withToolSpan } from '@/lib/otel';
import type { PubMedArticle } from './pubmed';
import type { CochraneReview } from './cochrane';
import type { EuropePMCArticle } from './europepmc';

// Dynamic import for transformers.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelineModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rerankerPipeline: any = null;

// Model configuration
const PRIMARY_MODEL = 'Xenova/bge-reranker-v2-m3';
const FALLBACK_MODEL = 'Xenova/bge-reranker-base';

/**
 * Initialize the reranker pipeline
 */
async function getRerankerPipeline() {
    if (rerankerPipeline) return rerankerPipeline;

    if (!pipelineModule) {
        try {
            pipelineModule = await import('@xenova/transformers');
        } catch (error) {
            console.error('[BGEReranker] Failed to load @xenova/transformers:', error);
            throw new Error('BGE Reranker not available - @xenova/transformers failed to load');
        }
    }

    const { pipeline } = pipelineModule;

    // Try primary model first, fallback if needed
    try {
        console.log(`[BGEReranker] Loading model: ${PRIMARY_MODEL}...`);
        const startTime = Date.now();

        rerankerPipeline = await pipeline('text-classification', PRIMARY_MODEL, {
            quantized: true, // Use quantized model for faster inference
        });

        console.log(`[BGEReranker] Model loaded in ${Date.now() - startTime}ms`);
    } catch (primaryError) {
        console.warn(`[BGEReranker] Primary model failed, trying fallback: ${FALLBACK_MODEL}`);
        try {
            rerankerPipeline = await pipeline('text-classification', FALLBACK_MODEL, {
                quantized: true,
            });
            console.log(`[BGEReranker] Fallback model loaded successfully`);
        } catch (fallbackError) {
            console.error('[BGEReranker] Both models failed to load:', fallbackError);
            throw new Error('BGE Reranker failed to initialize');
        }
    }

    return rerankerPipeline;
}

/**
 * Result from BGE reranking
 */
export interface BGERankedArticle<T> {
    article: T;
    score: number;       // BGE relevance score (0-1)
    originalRank: number;
}

/**
 * Options for BGE reranking
 */
export interface BGERerankerOptions {
    topK?: number;           // Number of articles to rerank (default: 50)
    minScore?: number;       // Minimum score threshold (default: 0.0)
    batchSize?: number;      // Batch size for inference (default: 8)
}

/**
 * Get text representation of an article for reranking
 */
function getArticleText(article: { title: string; abstract?: string; abstractText?: string }): string {
    const abstract = article.abstract || article.abstractText || '';
    if (abstract) {
        // BGE-M3 supports 8192 tokens, but trained on 512-1024. 
        // 2000 chars is approx 500 tokens, safe for performance and captures full abstracts.
        return `${article.title}. ${abstract}`.substring(0, 2000);
    }
    return article.title.substring(0, 2000);
}

/**
 * Core BGE reranking function with Phoenix tracing
 */
export async function rerankWithBGE<T extends { title: string; abstract?: string; abstractText?: string }>(
    query: string,
    articles: T[],
    options: BGERerankerOptions = {}
): Promise<BGERankedArticle<T>[]> {
    const {
        topK = 50,
        minScore = 0.0,
        batchSize = 8,
    } = options;

    // Skip if too few articles
    if (articles.length < 3) {
        console.log(`[BGEReranker] Skipping: only ${articles.length} articles`);
        return articles.map((article, index) => ({
            article,
            score: 1.0,
            originalRank: index,
        }));
    }

    // Wrap with Phoenix Tool Span for observability
    return withToolSpan<BGERankedArticle<T>[]>(
        'bge-reranker',
        'rerank',
        async (span) => {
            const startTime = Date.now();
            const articlesToRerank = articles.slice(0, topK);

            // Set span attributes for Phoenix dashboard
            span.setAttribute('reranker.model', PRIMARY_MODEL);
            span.setAttribute('reranker.input_count', articlesToRerank.length);
            span.setAttribute('reranker.query', query.substring(0, 200));

            try {
                const ranker = await getRerankerPipeline();

                // Build query-document pairs for cross-encoding
                const pairs: Array<{ text: string; text_pair: string }> = articlesToRerank.map(article => ({
                    text: query,
                    text_pair: getArticleText(article),
                }));

                // Process in batches
                const scores: number[] = [];
                for (let i = 0; i < pairs.length; i += batchSize) {
                    const batch = pairs.slice(i, i + batchSize);

                    // Run inference on batch
                    const batchResults = await Promise.all(
                        batch.map(async (pair) => {
                            try {
                                const output = await ranker(pair.text, { text_pair: pair.text_pair });
                                // BGE reranker outputs logits, apply sigmoid for 0-1 score
                                const logit = output[0]?.score || 0;
                                return 1 / (1 + Math.exp(-logit)); // Sigmoid
                            } catch (err) {
                                console.warn('[BGEReranker] Inference error for pair:', err);
                                return 0.5; // Neutral score on error
                            }
                        })
                    );
                    scores.push(...batchResults);
                }

                // Build ranked results
                const rankedArticles: BGERankedArticle<T>[] = articlesToRerank.map((article, index) => ({
                    article,
                    score: scores[index] || 0,
                    originalRank: index,
                }));

                // Sort by score (descending)
                rankedArticles.sort((a, b) => b.score - a.score);

                // Filter by minimum score
                const filteredArticles = rankedArticles.filter(item => item.score >= minScore);

                // Calculate metrics for Phoenix
                const avgScore = filteredArticles.length > 0
                    ? filteredArticles.reduce((sum, item) => sum + item.score, 0) / filteredArticles.length
                    : 0;
                const topScore = filteredArticles.length > 0 ? filteredArticles[0].score : 0;
                const elapsedTime = Date.now() - startTime;

                // Set result attributes on span
                span.setAttribute('reranker.output_count', filteredArticles.length);
                span.setAttribute('reranker.avg_score', Math.round(avgScore * 1000) / 1000);
                span.setAttribute('reranker.top_score', Math.round(topScore * 1000) / 1000);
                span.setAttribute('reranker.latency_ms', elapsedTime);

                console.log(
                    `[BGEReranker] Reranked ${filteredArticles.length} articles in ${elapsedTime}ms ` +
                    `(avg: ${avgScore.toFixed(3)}, top: ${topScore.toFixed(3)})`
                );

                return filteredArticles;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                span.setAttribute('reranker.error', errorMessage);
                console.error('[BGEReranker] Reranking failed, returning original order:', error);

                // Graceful degradation: return original order
                return articles.map((article, index) => ({
                    article,
                    score: 1.0,
                    originalRank: index,
                }));
            }
        },
        {
            'reranker.type': 'cross-encoder',
            'reranker.provider': 'BAAI',
        }
    );
}

/**
 * Convenience function to rerank PubMed articles
 */
export async function rerankPubMedWithBGE(
    query: string,
    articles: PubMedArticle[],
    options: BGERerankerOptions = {}
): Promise<PubMedArticle[]> {
    const ranked = await rerankWithBGE(query, articles, options);
    return ranked.map(item => item.article);
}

/**
 * Convenience function to rerank Cochrane reviews
 */
export async function rerankCochraneWithBGE(
    query: string,
    reviews: CochraneReview[],
    options: BGERerankerOptions = {}
): Promise<CochraneReview[]> {
    const ranked = await rerankWithBGE(query, reviews, options);
    return ranked.map(item => item.article);
}

/**
 * Convenience function to rerank Europe PMC articles
 */
export async function rerankEuropePMCWithBGE(
    query: string,
    articles: EuropePMCArticle[],
    options: BGERerankerOptions = {}
): Promise<EuropePMCArticle[]> {
    // Adapt field names
    const adapted = articles.map(a => ({
        ...a,
        abstract: a.abstractText,
    }));
    const ranked = await rerankWithBGE(query, adapted, options);
    return ranked.map(item => item.article as unknown as EuropePMCArticle);
}

/**
 * Get average score from a reranked result set
 * Used by sufficiency scorer to determine Tavily fallback
 */
export function getAverageScore<T>(rankedArticles: BGERankedArticle<T>[]): number {
    if (rankedArticles.length === 0) return 0;
    return rankedArticles.reduce((sum, item) => sum + item.score, 0) / rankedArticles.length;
}

/**
 * Check if reranked evidence quality is sufficient
 * If false, Tavily fallback should be triggered
 */
export function isEvidenceQualitySufficient<T>(
    rankedArticles: BGERankedArticle<T>[],
    minAvgScore: number = 0.3,
    minTopScore: number = 0.5
): boolean {
    if (rankedArticles.length === 0) return false;

    const avgScore = getAverageScore(rankedArticles);
    const topScore = rankedArticles[0]?.score || 0;

    const isSufficient = avgScore >= minAvgScore && topScore >= minTopScore;

    if (!isSufficient) {
        console.log(
            `[BGEReranker] Evidence quality insufficient: avg=${avgScore.toFixed(3)}, top=${topScore.toFixed(3)} ` +
            `(need avg>=${minAvgScore}, top>=${minTopScore})`
        );
    }

    return isSufficient;
}
