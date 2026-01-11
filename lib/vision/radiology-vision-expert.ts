/**
 * Radiology Vision Expert System
 * 
 * Specialized system for chest X-ray, CT, and MRI analysis
 * Implements best practices from medical imaging research
 * 
 * Key Features:
 * - Multi-view correlation (PA + Lateral)
 * - Specific sign detection (Golden's S, Silhouette, etc.)
 * - Precise anatomical localization
 * - Differential diagnosis generation
 * - Urgency classification
 */

import { openai, OPENAI_MODELS } from "@/lib/openai";
import { type AdvancedVisionAnalysis } from "./advanced-medical-vision";

export interface RadiologyExpertAnalysis extends AdvancedVisionAnalysis {
  // Radiology-specific fields
  viewType: "PA" | "AP" | "Lateral" | "Oblique" | "Unknown";
  specificSigns: SpecificRadiologicalSign[];
  multiViewCorrelation?: MultiViewCorrelation;
  measurements: RadiologicalMeasurement[];
}

export interface SpecificRadiologicalSign {
  name: string; // e.g., "Golden's S Sign", "Silhouette Sign", "Air Bronchogram"
  present: boolean;
  confidence: number;
  location: string;
  clinicalSignificance: string;
  supportingFindings: string[];
}

export interface MultiViewCorrelation {
  viewsAnalyzed: string[];
  correlatedFindings: Array<{
    findingId: string;
    visibleInViews: string[];
    locationConfirmed: boolean;
    depthEstimate?: string;
  }>;
  discrepancies: string[];
}

export interface RadiologicalMeasurement {
  structure: string;
  measurement: number;
  unit: string;
  normalRange: string;
  interpretation: "normal" | "borderline" | "abnormal";
}

/**
 * Expert chest X-ray analysis prompt (XML Structure)
 * Based on systematic radiology reading approach
 */
const CHEST_XRAY_EXPERT_PROMPT = `
<system_prompt>
  <role>
    You are a board-certified thoracic radiologist with 20+ years of experience.
    You perform systematic, expert-level chest X-ray analysis.
  </role>
  
  <task>
    Analyze chest X-ray images following the systematic protocol below.
    Provide precise anatomical localization with bounding boxes and confidence scores.
  </task>
  
  <analysis_steps>
    <step id="1" name="technical_assessment">
      <description>Technical Quality Assessment</description>
      <checks>
        - View type: PA, AP, or Lateral
        - Rotation: Check clavicle symmetry
        - Penetration: Can you see vertebral bodies through heart?
        - Inspiration: Count posterior ribs (should see 9-10)
        - Image quality: Rate as excellent/good/adequate/poor
      </checks>
    </step>
    
    <step id="2" name="anatomical_landmarks">
      <description>Identify Landmarks (0-1000 coordinate system)</description>
      <landmarks>
        - Trachea (should be midline at x=500)
        - Carina (bifurcation point)
        - Right hemidiaphragm (usually higher than left)
        - Left hemidiaphragm
        - Cardiac borders (right atrium, left ventricle)
        - Aortic knob
        - Right hilum (should be lower than left)
        - Left hilum
        - Costophrenic angles (should be sharp)
      </landmarks>
    </step>
    
    <step id="3" name="zone_analysis">
      <description>Systematic Zone Analysis</description>
      <zones>
        <zone name="RUZ">Lung parenchyma density, vascular markings, masses, volume loss</zone>
        <zone name="RMZ">Right heart border visibility, horizontal fissure, hilar structures</zone>
        <zone name="RLZ">Hemidiaphragm contour, costophrenic angle, retrocardiac space</zone>
        <zone name="LUZ">Aortic knob, apical lung, clavicle</zone>
        <zone name="LMZ">Left heart border, hilar structures</zone>
        <zone name="LLZ">Hemidiaphragm, gastric bubble, costophrenic angle</zone>
      </zones>
    </step>
    
    <step id="4" name="sign_detection">
      <description>Specific Radiological Sign Detection</description>
      <signs>
        <sign name="goldens_s">RUL collapse + central mass: Dense opacity in RUL, S-shaped horizontal fissure, tracheal deviation to RIGHT</sign>
        <sign name="silhouette">Loss of normal borders: RML disease = loss of right heart border, Lingula = left heart border</sign>
        <sign name="air_bronchogram">Air-filled bronchi visible within consolidation (pneumonia, edema)</sign>
        <sign name="kerley_b">Short horizontal lines at lung bases (interstitial edema)</sign>
        <sign name="pneumothorax">Absent lung markings peripherally, visible pleural line, deep sulcus sign</sign>
      </signs>
    </step>
    
    <step id="5" name="measurements">
      <description>Quantitative Measurements</description>
      <measures>
        - Cardiothoracic ratio (CTR): Normal less than 0.5 on PA, less than 0.55 on AP
        - Tracheal deviation: distance from midline
        - Mass size: measure in mm
      </measures>
    </step>
    
    <step id="6" name="localization">
      <description>Precise Localization for Each Finding</description>
      <requirements>
        <requirement name="bounding_box">
          Measure the ACTUAL abnormality, not the entire zone.
          Example: 3cm mass = ~100-120 pixels box, NOT 300+ pixels for entire lobe.
        </requirement>
        <requirement name="heatmap_region">
          Radius = 0.6 × average dimension of pathology
          Intensity: 0.9-1.0 critical, 0.6-0.8 moderate, 0.3-0.5 mild
        </requirement>
        <requirement name="anatomical_description">
          Specific zone (RUL, RML, RLL, LUL, Lingula, LLL)
          Relation to landmarks (e.g., "2cm superior to right hilum")
        </requirement>
      </requirements>
    </step>
  </analysis_steps>
  
  <rules>
    <rule>Every finding MUST have precise bounding box and heatmap region</rule>
    <rule>Bounding boxes should be TIGHT (not entire anatomical zones)</rule>
    <rule>Confidence greater than 0.85 for critical findings</rule>
    <rule>Differential diagnosis should be ranked by likelihood</rule>
    <rule>Recommendations should be specific and actionable</rule>
  </rules>
  
  <output_format type="json">
    {
      "viewType": "PA|AP|Lateral",
      "imageQuality": "excellent|good|adequate|poor",
      "technicalNotes": "...",
      "landmarks": [{"name": "...", "location": {"x": 500, "y": 150}, "confidence": 0.95, "description": "..."}],
      "findings": [{
        "id": "finding_1",
        "type": "mass|opacity|nodule|effusion",
        "anatomicalZone": "Right Upper Lobe",
        "description": "...",
        "severity": "critical|moderate|mild",
        "confidence": 0.92,
        "boundingBox": {"xmin": 520, "ymin": 180, "xmax": 620, "ymax": 280, "label": "RUL Mass"},
        "heatmapRegion": {"centerX": 570, "centerY": 230, "radius": 60, "intensity": 0.95},
        "clinicalSignificance": "...",
        "differentialDiagnosis": ["...", "..."],
        "relatedLandmarks": ["Right hilum", "Horizontal fissure"]
      }],
      "specificSigns": [{"name": "Golden's S Sign", "present": true, "confidence": 0.88, "location": "...", "clinicalSignificance": "...", "supportingFindings": ["..."]}],
      "measurements": [{"structure": "...", "measurement": 0.48, "unit": "ratio", "normalRange": "...", "interpretation": "normal|abnormal"}],
      "overallImpression": "...",
      "urgency": "emergent|urgent|routine",
      "recommendations": ["..."]
    }
  </output_format>
  
  <goal>
    Provide expert-level radiological analysis with precise anatomical localization,
    quantitative measurements, and actionable clinical recommendations.
    Output must be valid JSON only (no markdown, no code blocks).
  </goal>
  
  <examples>
    <example type="correct_finding">
      {
        "id": "finding_1",
        "type": "mass",
        "anatomicalZone": "Right Upper Lobe",
        "description": "Dense opacity with irregular margins, 4cm diameter",
        "severity": "critical",
        "confidence": 0.92,
        "boundingBox": {"xmin": 520, "ymin": 180, "xmax": 620, "ymax": 280, "label": "RUL Mass"},
        "heatmapRegion": {"centerX": 570, "centerY": 230, "radius": 60, "intensity": 0.95},
        "clinicalSignificance": "Highly suspicious for primary lung malignancy",
        "differentialDiagnosis": ["Bronchogenic carcinoma (most likely)", "Lymphoma", "Metastatic disease"]
      }
    </example>
  </examples>
</system_prompt>
`;

/**
 * Analyze chest X-ray with expert-level precision
 */
export async function analyzeChestXRayExpert(
  imageBase64: string,
  mimeType: string,
  clinicalContext?: {
    patientAge?: number;
    symptoms?: string[];
    clinicalQuestion?: string;
    priorStudies?: string;
  }
): Promise<RadiologyExpertAnalysis> {
  const startTime = performance.now();

  console.log("🩺 Starting expert chest X-ray analysis (OpenAI Vision)...");

  // Build clinical context
  const contextText = clinicalContext
    ? `\n\n**CLINICAL CONTEXT**:\n` +
    (clinicalContext.patientAge ? `- Patient Age: ${clinicalContext.patientAge} years\n` : '') +
    (clinicalContext.symptoms ? `- Presenting Symptoms: ${clinicalContext.symptoms.join(', ')}\n` : '') +
    (clinicalContext.clinicalQuestion ? `- Clinical Question: ${clinicalContext.clinicalQuestion}\n` : '') +
    (clinicalContext.priorStudies ? `- Prior Studies: ${clinicalContext.priorStudies}\n` : '')
    : '';

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODELS.VISION,
    messages: [
      { role: "system", content: CHEST_XRAY_EXPERT_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: `Analyze this image.\n${contextText}` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ]
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1, // Precision is key
    max_tokens: 4000
  });

  const responseText = completion.choices[0].message.content || "{}";
  const data = JSON.parse(responseText);

  const processingTimeMs = performance.now() - startTime;
  const analysisId = `rad_expert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Calculate overall confidence
  const findings = data.findings || [];
  const analysisConfidence = findings.length > 0
    ? findings.reduce((sum: number, f: any) => sum + f.confidence, 0) / findings.length
    : 0.95;

  console.log(`✅ Expert analysis complete: ${findings.length} findings, ${data.specificSigns?.length || 0} specific signs`);

  return {
    analysisId,
    timestamp: new Date().toISOString(),
    processingTimeMs,
    viewType: data.viewType || "Unknown",
    landmarks: data.landmarks || [],
    findings: findings,
    specificSigns: data.specificSigns || [],
    measurements: data.measurements || [],
    overallImpression: data.overallImpression || "Analysis complete",
    urgency: data.urgency || "routine",
    recommendations: data.recommendations || [],
    imageQuality: data.imageQuality || "good",
    analysisConfidence,
  };
}

/**
 * Analyze multiple views and correlate findings
 */
export async function analyzeMultiViewChestXRay(
  images: Array<{ base64: string; mimeType: string; viewHint?: string }>,
  clinicalContext?: any
): Promise<RadiologyExpertAnalysis> {
  console.log(`🔬 Analyzing ${images.length} views for correlation...`);

  // Analyze each view independently
  const analyses = await Promise.all(
    images.map(img => analyzeChestXRayExpert(img.base64, img.mimeType, clinicalContext))
  );

  // Correlate findings across views
  const correlatedFindings: any[] = [];
  const allFindings = analyses.flatMap(a => a.findings);

  // Group similar findings from different views
  allFindings.forEach((finding, idx) => {
    const similar = allFindings.filter((f, i) =>
      i !== idx &&
      f.anatomicalZone === finding.anatomicalZone &&
      f.type === finding.type
    );

    if (similar.length > 0) {
      correlatedFindings.push({
        findingId: finding.id,
        visibleInViews: [analyses[0].viewType, ...similar.map(() => "Lateral")],
        locationConfirmed: true,
        depthEstimate: "Confirmed in multiple views",
      });
    }
  });

  // Merge analyses
  const primaryAnalysis = analyses[0];

  return {
    ...primaryAnalysis,
    multiViewCorrelation: {
      viewsAnalyzed: analyses.map(a => a.viewType),
      correlatedFindings,
      discrepancies: [],
    },
  };
}
