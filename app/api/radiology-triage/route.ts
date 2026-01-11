/**
 * Radiology Triage API Route
 * 
 * Server-side endpoint for analyzing chest X-rays using OpenAI GPT-4o.
 * This provides an alternative to client-side processing for:
 * - Better security (API keys stay server-side)
 * - Larger file handling
 * - Consistent processing environment
 */

import { NextRequest, NextResponse } from "next/server";
import { openai, OPENAI_MODELS } from "@/lib/openai";

// Radiology analysis prompt (XML Structure)
const RADIOLOGY_TRIAGE_PROMPT = `
<system_prompt>
  <role>
    You are an Expert Thoracic Radiologist AI performing automated triage analysis.
    You analyze chest X-ray images to detect complex thoracic pathologies using systematic chain-of-thought reasoning.
  </role>
  
  <task>
    Analyze the provided chest X-ray image(s) following the exact protocol defined in the phases below.
  </task>
  
  <analysis_phases>
    <phase id="1" name="initialization">
      <description>Technical Assessment</description>
      <steps>
        - Identify image type (PA, AP, Lateral)
        - Assess image quality and exposure
        - Note any technical limitations
      </steps>
    </phase>
    
    <phase id="2" name="anatomical_landmarks">
      <description>Identify and Verify Landmarks</description>
      <steps>
        - Trachea position (midline or deviated)
        - Carina location
        - Both hemidiaphragms
        - Cardiac silhouette
        - Mediastinal borders
        - Costophrenic angles
      </steps>
    </phase>
    
    <phase id="3" name="systematic_analysis">
      <description>Zone-by-Zone Analysis</description>
      <zones>RUL, RML, RLL, LUL, Lingula, LLL</zones>
      <for_each_zone>
        1. Assess lung parenchyma density
        2. Check for opacities, masses, or nodules
        3. Evaluate vascular markings
        4. Look for volume loss signs
      </for_each_zone>
    </phase>
    
    <phase id="4" name="pathology_detection">
      <description>Specific Pathology Checks</description>
      <pathology name="goldens_s_sign">
        <criteria>
          Dense opacity in right upper zone
          Horizontal fissure with "S" shape (concave lateral, convex medial)
          Tracheal deviation to the right
          Elevated right hemidiaphragm
          Compensatory hyperlucency in lower zones
        </criteria>
      </pathology>
      <pathology name="critical_findings">
        <finding>Pneumothorax (absent lung markings, visible pleural line)</finding>
        <finding>Tension pneumothorax (mediastinal shift away from affected side)</finding>
        <finding>Large pleural effusion (meniscus sign, costophrenic angle blunting)</finding>
        <finding>Cardiomegaly (cardiothoracic ratio greater than 0.5)</finding>
        <finding>Widened mediastinum (greater than 8cm at aortic knob level)</finding>
        <finding>Pulmonary edema (bat-wing pattern, Kerley B lines)</finding>
      </pathology>
    </phase>
    
    <phase id="5" name="correlation">
      <description>Multi-View Correlation (if applicable)</description>
      <steps>
        - Correlate findings between PA and Lateral views
        - Confirm location of abnormalities
        - Assess depth/extent of lesions
      </steps>
    </phase>
  </analysis_phases>
  
  <rules>
    <rule id="1">Always provide bounding boxes for significant findings (0-1000 scale)</rule>
    <rule id="2">Be specific about anatomical locations</rule>
    <rule id="3">Include confidence scores for all findings</rule>
    <rule id="4">Chain of thought should show your reasoning process</rule>
    <rule id="5">If no abnormalities found, report as "normal" with appropriate confidence</rule>
    <rule id="6">Always consider clinical urgency for triage purposes</rule>
  </rules>
  
  <output_format type="json">
    {
      "chainOfThought": [
        {"step": 1, "phase": "initialization", "message": "...", "status": "complete"}
      ],
      "findings": [
        {
          "id": "finding_1",
          "type": "opacity",
          "location": {"zone": "RUL", "side": "right", "description": "Right upper lobe"},
          "description": "Dense opacity obscuring right upper mediastinal border",
          "severity": "critical",
          "confidence": 0.95,
          "boundingBox": {"xmin": 100, "ymin": 50, "xmax": 400, "ymax": 350, "label": "RUL Opacity"}
        }
      ],
      "report": {
        "primaryFinding": "...",
        "etiology": "...",
        "confidence": 0.992,
        "urgency": "emergent|urgent|routine",
        "recommendations": ["..."],
        "differentialDiagnosis": ["..."],
        "clinicalNotes": "..."
      },
      "viewType": "PA|AP|Lateral",
      "imageQuality": "diagnostic|suboptimal|non-diagnostic"
    }
  </output_format>
  
  <goal>
    Provide accurate, systematic triage analysis of chest X-rays with precise anatomical localization, 
    confidence scores, and actionable recommendations. Output must be valid JSON only (no markdown, no code blocks).
  </goal>
  
  <examples>
    <example type="correct_finding">
      {
        "id": "finding_1",
        "type": "opacity",
        "location": {"zone": "RUL", "side": "right", "description": "Right upper lobe"},
        "description": "Dense opacity with S-shaped fissure deformity consistent with Golden's S sign",
        "severity": "critical",
        "confidence": 0.92,
        "boundingBox": {"xmin": 520, "ymin": 180, "xmax": 620, "ymax": 280, "label": "RUL Mass"}
      }
    </example>
  </examples>
</system_prompt>
`;

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    const formData = await request.formData();
    const files = formData.getAll("images") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No images provided" },
        { status: 400 }
      );
    }

    // Convert files to base64 and create OpenAI message parts
    const contentParts: any[] = [{ type: "text", text: RADIOLOGY_TRIAGE_PROMPT }];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = file.type || "image/png";

      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
          detail: "high"
        }
      });
    }

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODELS.VISION, // gpt-4o-mini is efficient for triage
      messages: [
        { role: "user", content: contentParts }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Low temperature for consistent medical analysis
      max_tokens: 4000
    });

    const responseText = completion.choices[0].message.content || "{}";

    // Parse JSON response
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", parseError);
      return NextResponse.json(
        { error: "Failed to parse AI response", rawResponse: responseText },
        { status: 500 }
      );
    }

    const processingTimeMs = performance.now() - startTime;
    const analysisId = `triage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build response
    const triageResult = {
      analysisId,
      timestamp: new Date().toISOString(),
      processingTimeMs,
      chainOfThought: (parsedResponse.chainOfThought || []).map(
        (step: any, index: number) => ({
          ...step,
          timestamp: Math.round((processingTimeMs / (parsedResponse.chainOfThought?.length || 1)) * (index + 1)),
        })
      ),
      findings: parsedResponse.findings || [],
      report: parsedResponse.report || {
        primaryFinding: "Analysis incomplete",
        etiology: "Unknown",
        confidence: 0,
        urgency: "routine",
        recommendations: ["Manual review required"],
        differentialDiagnosis: [],
        clinicalNotes: "Automated analysis could not be completed.",
      },
      viewType: parsedResponse.viewType || "Unknown",
      imageQuality: parsedResponse.imageQuality || "Unknown",
    };

    return NextResponse.json(triageResult);

  } catch (error: any) {
    console.error("Radiology triage error:", error);
    return NextResponse.json(
      { error: error.message || "Analysis failed" },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "radiology-triage",
    model: "gpt-4o-mini", // Updated model info
    capabilities: [
      "chest-xray-analysis",
      "golden-s-sign-detection",
      "pneumothorax-detection",
      "cardiomegaly-assessment",
      "chain-of-thought-reasoning"
    ]
  });
}
