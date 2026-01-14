/**
 * Medical Image Intent Detector
 * 
 * Analyzes queries to determine which image source(s) to use:
 * - Open-i (NLM): Pathology, research figures, imaging
 * - InjuryMap: MSK anatomy, body regions
 */

export interface ImageIntent {
  primary: 'openi' | 'injurymap' | 'mixed';
  sources: Array<'openi' | 'injurymap'>;
  confidence: number;
  keywords: {
    diseases: string[];
    organs: string[];
    modalities: string[];
    bodyParts: string[];
    cancer: boolean;
    msk: boolean;
    imaging: boolean;
  };
}

/**
 * Detect image intent from clinical query
 */
export function detectImageIntent(
  query: string,
  mode: 'doctor' | 'general'
): ImageIntent {
  const lowerQuery = query.toLowerCase();
  
  const keywords = {
    diseases: [] as string[],
    organs: [] as string[],
    modalities: [] as string[],
    bodyParts: [] as string[],
    cancer: false,
    msk: false,
    imaging: false
  };
  
  // Detect cancer
  if (lowerQuery.match(/cancer|tumor|oncology|malignancy|carcinoma|lymphoma|leukemia|metastasis/)) {
    keywords.cancer = true;
  }
  
  // Detect MSK/body parts
  const mskTerms = [
    'knee', 'shoulder', 'hip', 'ankle', 'elbow', 'wrist',
    'spine', 'back', 'neck', 'joint', 'ligament', 'tendon',
    'muscle', 'bone', 'skeletal', 'musculoskeletal',
    'rotator cuff', 'meniscus', 'acl', 'mcl', 'pcl',
    'lumbar', 'cervical', 'thoracic', 'vertebra'
  ];
  
  mskTerms.forEach(term => {
    if (lowerQuery.includes(term)) {
      keywords.msk = true;
      keywords.bodyParts.push(term);
    }
  });
  
  // Detect imaging modalities
  const modalities = ['ultrasound', 'echo', 'scan'];
  modalities.forEach(mod => {
    if (lowerQuery.includes(mod)) {
      keywords.imaging = true;
      keywords.modalities.push(mod);
    }
  });
  
  // Detect diseases
  const diseases = [
    'atrial fibrillation', 'heart failure', 'diabetes', 'hypertension',
    'stroke', 'pneumonia', 'copd', 'asthma', 'ckd', 'kidney disease',
    'vte', 'dvt', 'pulmonary embolism', 'myocardial infarction'
  ];
  
  diseases.forEach(disease => {
    if (lowerQuery.includes(disease)) {
      keywords.diseases.push(disease);
    }
  });
  
  // Detect organs
  const organs = [
    'heart', 'lung', 'kidney', 'liver', 'brain', 'pancreas',
    'stomach', 'intestine', 'colon', 'breast', 'prostate'
  ];
  
  organs.forEach(organ => {
    if (lowerQuery.includes(organ)) {
      keywords.organs.push(organ);
    }
  });
  
  // ROUTING LOGIC
  // CRITICAL FIX: InjuryMap is disabled due to broken URLs
  // Route ALL queries to Open-i for maximum image coverage
  
  // 1. CANCER INTENT → Open-i Primary
  if (keywords.cancer) {
    return {
      primary: 'openi',
      sources: ['openi'],
      confidence: 0.9,
      keywords
    };
  }
  
  // 2. MSK INTENT → Open-i (InjuryMap disabled)
  if (keywords.msk && keywords.diseases.length === 0 && !keywords.imaging) {
    return {
      primary: 'openi',
      sources: ['openi'], // Changed from injurymap to openi
      confidence: 0.85,
      keywords
    };
  }
  
  // 3. PATHOLOGY/IMAGING INTENT → Open-i Primary
  if (keywords.imaging || (keywords.diseases.length > 0 && mode === 'doctor')) {
    return {
      primary: 'openi',
      sources: ['openi'],
      confidence: 0.9,
      keywords
    };
  }
  
  // 4. ANATOMY INTENT (General Mode) → Open-i (InjuryMap disabled)
  if (keywords.organs.length > 0 && mode === 'general') {
    return {
      primary: 'openi',
      sources: ['openi'], // Changed from injurymap to openi
      confidence: 0.7,
      keywords
    };
  }
  
  // 5. MIXED/GENERAL INTENT → Open-i only (InjuryMap disabled)
  return {
    primary: 'openi',
    sources: ['openi'], // Changed to always use openi
    confidence: 0.5,
    keywords
  };
}

/**
 * Get search queries optimized for each source
 */
export function getSourceQueries(
  query: string,
  intent: ImageIntent
): Record<'openi' | 'injurymap', string> {
  const { keywords } = intent;
  
  // CRITICAL FIX: Build more specific queries based on detected diseases/organs
  let openiQuery = '';

  if (keywords.diseases.length > 0) {
    // Use specific diseases for more targeted image search
    const diseaseTerms = keywords.diseases.slice(0, 2).join(' ');
    openiQuery = keywords.imaging
      ? `${diseaseTerms} imaging diagnosis`
      : `${diseaseTerms} pathophysiology diagram algorithm`;
  } else if (keywords.organs.length > 0) {
    // Use organ-specific queries
    const organTerms = keywords.organs.slice(0, 2).join(' ');
    openiQuery = `${organTerms} anatomy diagram`;
  } else if (keywords.bodyParts.length > 0) {
    // Use MSK body parts
    const bodyTerms = keywords.bodyParts.slice(0, 2).join(' ');
    openiQuery = `${bodyTerms} anatomy musculoskeletal diagram`;
  } else {
    // Fallback: Extract key medical terms from query for more specific search
    // Avoid generic "What is X" phrasing
    const cleanQuery = query
      .replace(/^what is\b/i, '')
      .replace(/^how to\b/i, '')
      .replace(/^tell me about\b/i, '')
      .replace(/\?/g, '')
      .trim();

    openiQuery = keywords.imaging
      ? `${cleanQuery} medical imaging`
      : `${cleanQuery} diagram pathophysiology`;
  }

  console.log(`   🎯 Open-i query built: "${openiQuery}"`);

  return {
    // Open-i: Use disease/organ-specific query
    openi: openiQuery,
    
    // InjuryMap: Pass full query to search multiple body parts
    // The searchInjuryMap function will extract all mentioned body parts
    injurymap: query
  };
}
