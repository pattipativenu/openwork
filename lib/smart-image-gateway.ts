/**
 * Smart Medical Image Query Generator
 * 
 * Uses GPT to generate targeted Open-i search queries and validate image relevance.
 * This ensures only clinically relevant images are displayed for Doctor Mode.
 */

import OpenAI from 'openai';
import type { OpenIImage, OpenISearchParams } from './open-i-client';

const openai = new OpenAI();

/**
 * Generate optimized Open-i search queries using GPT
 */
export async function generateSmartImageQueries(
    clinicalQuery: string,
    mode: 'doctor' | 'general'
): Promise<{ queries: string[]; expectedKeywords: string[] }> {
    console.log(`🧠 Generating smart image queries for: "${clinicalQuery}" (${mode} mode)`);

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 200,
            messages: [
                {
                    role: 'system',
                    content: `You are a medical image search expert. Given a clinical query, generate 2-3 specific search queries for the Open-i biomedical image database.

RULES:
1. Focus on the PRIMARY medical condition/disease mentioned
2. Use precise medical terminology (e.g., "Candida albicans", "atrial fibrillation", "heart failure")
3. Add modifiers like "pathophysiology", "diagram", "algorithm", "mechanism", "histology", "imaging"
4. AVOID generic terms that could match unrelated images
5. Also provide 3-5 keywords that MUST appear in relevant image titles/descriptions

Return JSON format:
{
  "queries": ["specific query 1", "specific query 2"],
  "expectedKeywords": ["keyword1", "keyword2", "keyword3"]
}`
                },
                {
                    role: 'user',
                    content: `Clinical query: "${clinicalQuery}"\n\nGenerate targeted Open-i image search queries.`
                }
            ],
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');

        console.log(`   🎯 Generated queries:`, result.queries);
        console.log(`   📋 Expected keywords:`, result.expectedKeywords);

        return {
            queries: result.queries || [],
            expectedKeywords: result.expectedKeywords || []
        };
    } catch (error) {
        console.error('❌ Smart query generation failed:', error);
        // Fallback: extract key medical terms from query
        const fallbackQuery = clinicalQuery
            .replace(/^what is\b/i, '')
            .replace(/^how to\b/i, '')
            .replace(/\?/g, '')
            .trim()
            .split(' ')
            .slice(0, 4)
            .join(' ');

        return {
            queries: [`${fallbackQuery} pathophysiology diagram`],
            expectedKeywords: fallbackQuery.split(' ').filter(w => w.length > 3)
        };
    }
}

/**
 * Validate image relevance against expected keywords
 * Returns true only if image title/description contains expected medical terms
 */
export function validateImageRelevance(
    image: { title: string; description?: string; abstract?: string },
    expectedKeywords: string[],
    clinicalQuery: string
): { isRelevant: boolean; score: number; reason: string } {
    const text = `${image.title} ${image.description || ''} ${image.abstract || ''}`.toLowerCase();
    const query = clinicalQuery.toLowerCase();

    // STRICT EXCLUSION LIST - these are NEVER relevant for clinical questions
    const strictExclusions = [
        'pearl', 'embryo', 'zebrafish', 'drosophila', 'mouse model', 'rat model',
        'xenopus', 'c. elegans', 'yeast', 'plant', 'bacteria culture', 'agar plate',
        'gel electrophoresis', 'western blot', 'crystallography', 'spectroscopy',
        'food', 'nutrition', 'recipe', 'cooking', 'agriculture',
        'murine', 'bovine', 'porcine', 'equine', 'veterinary',
        'art', 'sculpture', 'painting', 'photograph', 'portrait'
    ];

    for (const exclusion of strictExclusions) {
        if (text.includes(exclusion)) {
            return {
                isRelevant: false,
                score: 0,
                reason: `Contains excluded term: "${exclusion}"`
            };
        }
    }

    // Check for expected keyword matches
    let keywordScore = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of expectedKeywords) {
        if (text.includes(keyword.toLowerCase())) {
            keywordScore += 25;
            matchedKeywords.push(keyword);
        }
    }

    // Check for clinical relevance terms
    const clinicalTerms = [
        'pathophysiology', 'mechanism', 'diagram', 'algorithm', 'treatment',
        'therapy', 'clinical', 'patient', 'medical', 'disease', 'infection',
        'diagnosis', 'management', 'guideline', 'protocol', 'flowchart',
        'imaging', 'radiology', 'x-ray', 'ct', 'mri', 'ultrasound'
    ];

    for (const term of clinicalTerms) {
        if (text.includes(term)) {
            keywordScore += 10;
        }
    }

    // Check if any words from original query appear in image
    const queryWords = query.split(' ').filter(w => w.length > 3);
    for (const word of queryWords) {
        if (text.includes(word)) {
            keywordScore += 15;
        }
    }

    // Threshold: need at least 35 points to be considered relevant
    const isRelevant = keywordScore >= 35;

    return {
        isRelevant,
        score: keywordScore,
        reason: isRelevant
            ? `Matched keywords: ${matchedKeywords.join(', ')}`
            : `Score too low (${keywordScore}/35). No relevant keywords found.`
    };
}

/**
 * Full pipeline: Generate queries, search Open-i, validate relevance
 */
export async function getRelevantMedicalImages(
    clinicalQuery: string,
    mode: 'doctor' | 'general',
    searchOpenI: (params: OpenISearchParams) => Promise<OpenIImage[]>
): Promise<OpenIImage[]> {
    console.log(`🔍 Smart image retrieval for: "${clinicalQuery}"`);

    // Step 1: Generate smart queries using GPT
    const { queries, expectedKeywords } = await generateSmartImageQueries(clinicalQuery, mode);

    if (queries.length === 0) {
        console.log('⚠️ No queries generated - skipping image retrieval');
        return [];
    }

    // Step 2: Search Open-i with generated queries
    const allImages: OpenIImage[] = [];

    for (const query of queries.slice(0, 2)) { // Limit to 2 queries
        console.log(`   🔎 Searching: "${query}"`);
        try {
            const images = await searchOpenI({
                query,
                maxResults: 6,
                collection: 'pmc',
                imageType: 'xg' // Graphics/diagrams
            });
            allImages.push(...images);
        } catch (error) {
            console.error(`   ❌ Search failed for "${query}":`, error);
        }
    }

    console.log(`   📊 Found ${allImages.length} images before validation`);

    // Step 3: Validate relevance of each image
    const validatedImages = allImages.filter(img => {
        const validation = validateImageRelevance(img, expectedKeywords, clinicalQuery);
        console.log(`   ${validation.isRelevant ? '✅' : '❌'} "${img.title.substring(0, 50)}..." - ${validation.reason}`);
        return validation.isRelevant;
    });

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const uniqueImages = validatedImages.filter((img: OpenIImage) => {
        const url = img.imgLarge;
        if (seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
    });

    console.log(`✅ Validated ${uniqueImages.length} relevant images out of ${allImages.length}`);

    // If no relevant images found, return empty (don't show irrelevant images)
    if (uniqueImages.length === 0) {
        console.log('⚠️ No relevant images passed validation - returning empty to avoid showing irrelevant content');
        return [];
    }

    return uniqueImages.slice(0, 4); // Return top 4 relevant images
}
