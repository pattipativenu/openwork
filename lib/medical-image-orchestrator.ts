/**
 * Medical Image Orchestrator
 * 
 * Intelligent routing and retrieval from multiple sources:
 * - Open-i (NLM): Pathology, research, imaging
 * - InjuryMap: MSK anatomy
 */

import { detectImageIntent, getSourceQueries } from './image-intent-detector';
import { searchOpenI, type OpenIImage } from './open-i-client';
// InjuryMap disabled due to broken/placeholder URLs - see INJURYMAP_DISABLED_FIX.md
// import { searchInjuryMap, type InjuryMapImage } from './injurymap-client';

export interface MedicalImage {
  id: string;
  url: string;
  title: string;
  description: string;
  source: 'Open-i' | 'InjuryMap';
  attribution: string;
  thumbnail?: string;
  score: number;
}

/**
 * Retrieve medical images with SMART GPT-powered query generation and validation
 * 
 * NEW APPROACH:
 * 1. Use GPT to generate targeted Open-i search queries based on clinical context
 * 2. Search Open-i with generated queries
 * 3. STRICTLY validate each image for relevance before returning
 * 4. Return empty array if no relevant images found (better than irrelevant images)
 */
export async function retrieveMedicalImagesIntelligent(
  query: string,
  mode: 'doctor' | 'general',
  _tags: { disease_tags: string[], decision_tags: string[] } // Unused but kept for API compatibility
): Promise<MedicalImage[]> {
  
  console.log(`🎯 SMART image retrieval for: "${query}" (${mode} mode)`);
  
  try {
    // Import smart gateway
    const { getRelevantMedicalImages } = await import('./smart-image-gateway');

    // Use the smart gateway which:
    // 1. Generates GPT-powered search queries
    // 2. Searches Open-i
    // 3. Validates relevance strictly
    // 4. Returns only relevant images (or empty array)
    const validatedImages = await getRelevantMedicalImages(
      query,
      mode,
      searchOpenI // Pass the searchOpenI function
    );

    // Convert to MedicalImage format
    const results: MedicalImage[] = validatedImages.map((img: OpenIImage) => ({
      id: img.id || `openi-${Date.now()}`,
      url: img.imgLarge,
      title: img.title,
      description: img.abstract || '',
      source: 'Open-i' as const,
      attribution: img.attribution || 'Open-i / National Library of Medicine',
      thumbnail: img.imgThumb,
      score: 100
    }));

    console.log(`✅ Smart retrieval returned ${results.length} validated images`);

    if (results.length === 0) {
      console.log('⚠️ No relevant images found - this is intentional to avoid showing irrelevant content');
    }

    return results;

  } catch (error) {
    console.error('❌ Smart image retrieval failed:', error);

    // FALLBACK: Use legacy approach but with strict filtering
    console.log('🔄 Falling back to legacy approach with strict filtering...');

    return legacyImageRetrieval(query, mode);
  }
}

/**
 * Legacy fallback with strict filtering
 */
async function legacyImageRetrieval(
  query: string,
  mode: 'doctor' | 'general'
): Promise<MedicalImage[]> {
  const intent = detectImageIntent(query, mode);
  const sourceQueries = getSourceQueries(query, intent);

  try {
    const images = await searchOpenI({
      query: sourceQueries.openi,
      maxResults: 8,
      imageType: 'xg',
      collection: 'pmc'
    });

    // STRICT FILTERING: Apply same exclusion logic as smart gateway
    const strictExclusions = [
      'pearl', 'embryo', 'zebrafish', 'drosophila', 'mouse model', 'rat model',
      'xenopus', 'c. elegans', 'yeast', 'plant', 'bacteria culture', 'agar plate',
      'gel electrophoresis', 'western blot', 'crystallography', 'spectroscopy',
      'food', 'nutrition', 'recipe', 'cooking', 'agriculture',
      'murine', 'bovine', 'porcine', 'equine', 'veterinary',
      'art', 'sculpture', 'painting', 'photograph', 'portrait'
    ];

    const filteredImages = images.filter((img: OpenIImage) => {
      const text = `${img.title} ${img.abstract || ''}`.toLowerCase();
      for (const exclusion of strictExclusions) {
        if (text.includes(exclusion)) {
          console.log(`   ❌ Excluded: "${img.title.substring(0, 40)}..." - contains "${exclusion}"`);
          return false;
        }
      }
      return true;
    });
    
    console.log(`   ✅ After strict filtering: ${filteredImages.length}/${images.length} images`);

    // Convert to MedicalImage format
    return filteredImages.slice(0, 4).map((img: OpenIImage) => ({
      id: img.id,
      url: img.imgLarge,
      title: img.title,
      description: img.abstract || '',
      source: 'Open-i' as const,
      attribution: img.attribution || 'Open-i / National Library of Medicine',
      thumbnail: img.imgThumb,
      score: 80
    }));

  } catch (error) {
    console.error('❌ Legacy retrieval also failed:', error);
    return [];
  }
}

/**
 * Format images for API response
 */
export function formatMedicalImagesForResponse(images: MedicalImage[]): any[] {
  return images.map(img => ({
    url: img.url,
    title: img.title,
    source: img.source,
    license: 'Free for reuse with attribution', // All from Open-i now
    thumbnail: img.thumbnail,
    description: img.description
  }));
}
