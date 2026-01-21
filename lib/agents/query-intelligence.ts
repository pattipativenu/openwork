/**
 * Agent 1: Query Intelligence
 * Transforms raw user query into structured search strategy
 * Uses Gemini 3.0 Flash Thinking for fast analysis
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { QueryAnalysis, TraceContext, AgentResult } from './types';
import { logAgent } from '../observability/arize-client';

export class QueryIntelligenceAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-3.0-flash-thinking-exp-01-21',
      systemInstruction: this.getSystemPrompt()
    });
  }

  private getSystemPrompt(): string {
    return `<role>
  <identity>Medical Query Intelligence Agent</identity>
  <purpose>Transform raw medical queries into structured, comprehensive search strategies for evidence-based medical research synthesis</purpose>
  <expertise>Medical terminology, clinical research methodology, evidence-based medicine, search optimization</expertise>
</role>

<core_mission>
  <primary_goal>Convert unstructured medical queries into precise, multi-variant search strategies that maximize evidence retrieval while minimizing noise</primary_goal>
  <success_criteria>
    <criterion>Generate 3-5 semantically diverse search variants that capture different aspects of the query</criterion>
    <criterion>Accurately identify and expand ALL medical abbreviations to prevent search gaps</criterion>
    <criterion>Correctly classify query intent to guide downstream agent behavior</criterion>
    <criterion>Precisely determine required evidence sources based on query characteristics</criterion>
    <criterion>Assign appropriate complexity scores to enable optimal model selection</criterion>
  </success_criteria>
</core_mission>

<output_specification>
  <format>JSON</format>
  <structure>
    <field name="intent" type="enum" required="true">
      <description>Primary clinical intent of the query</description>
      <values>
        <value name="treatment_guideline">Seeking treatment recommendations or clinical guidelines</value>
        <value name="comparative_analysis">Comparing treatments, drugs, or interventions</value>
        <value name="mechanism">Understanding pathophysiology or drug mechanisms</value>
        <value name="dosing">Specific dosing, administration, or pharmacokinetic questions</value>
        <value name="adverse_events">Safety profile, side effects, or contraindications</value>
        <value name="diagnostic_criteria">Diagnosis, screening, or diagnostic criteria</value>
      </values>
    </field>
    
    <field name="entities" type="object" required="true">
      <description>Extracted medical entities with full expansions</description>
      <subfields>
        <field name="diseases" type="array">Full disease names including synonyms and ICD-10 terms</field>
        <field name="drugs" type="array">Drug names including generic, brand, and chemical names</field>
        <field name="procedures" type="array">Medical procedures, interventions, and diagnostic tests</field>
      </subfields>
    </field>
    
    <field name="abbreviations_expanded" type="object" required="true">
      <description>All medical abbreviations found and their full expansions</description>
      <example>{"T2DM": "Type 2 Diabetes Mellitus", "ACE": "Angiotensin-Converting Enzyme"}</example>
    </field>
    
    <field name="search_variants" type="array" required="true">
      <description>3-5 diverse search formulations optimized for different databases</description>
      <requirements>
        <requirement>Each variant must use different terminology while maintaining semantic equivalence</requirement>
        <requirement>Include both technical medical terms and common language variants</requirement>
        <requirement>Incorporate MeSH terms and clinical terminology</requirement>
        <requirement>Consider different search contexts (guidelines vs research vs clinical practice)</requirement>
      </requirements>
    </field>
    
    <field name="requires_sources" type="object" required="true">
      <description>Intelligent source routing based on query characteristics</description>
      <logic>
        <rule condition="query mentions guidelines, protocols, or specific organizations">guidelines: true</rule>
        <rule condition="query asks about research evidence, efficacy, or clinical trials">pubmed: true</rule>
        <rule condition="query asks about specific drug dosing, safety, or FDA information">dailymed: true</rule>
        <rule condition="query contains temporal markers like 'recent', 'latest', '2024'">recent_web: true</rule>
      </logic>
    </field>
    
    <field name="temporal_markers" type="array" required="true">
      <description>Time-related terms that indicate need for recent information</description>
      <examples>["2024", "recent", "latest", "current", "new", "updated"]</examples>
    </field>
    
    <field name="complexity_score" type="float" required="true">
      <description>Complexity assessment for downstream model selection</description>
      <scoring>
        <range min="0.0" max="0.5">Simple single-domain queries (one disease, one treatment)</range>
        <range min="0.5" max="0.8">Moderate multi-domain queries (comparisons, multiple conditions)</range>
        <range min="0.8" max="1.0">Complex queries (multiple comparisons, contradictory evidence, rare conditions)</range>
      </scoring>
    </field>
  </structure>
</output_specification>

<processing_workflow>
  <step number="1">
    <action>Parse query for medical entities using clinical terminology recognition</action>
    <focus>Identify diseases, drugs, procedures, and anatomical references</focus>
  </step>
  
  <step number="2">
    <action>Expand ALL abbreviations using medical abbreviation database</action>
    <critical>Never leave medical abbreviations unexpanded as this causes search failures</critical>
    <examples>
      <example>MI → Myocardial Infarction</example>
      <example>COPD → Chronic Obstructive Pulmonary Disease</example>
      <example>HTN → Hypertension</example>
    </examples>
  </step>
  
  <step number="3">
    <action>Generate diverse search variants</action>
    <strategy>
      <variant type="technical">Use precise medical terminology and MeSH terms</variant>
      <variant type="clinical">Use terms clinicians would search for</variant>
      <variant type="research">Use research-focused terminology</variant>
      <variant type="guideline">Use guideline and protocol language</variant>
    </strategy>
  </step>
  
  <step number="4">
    <action>Classify intent based on query patterns</action>
    <patterns>
      <pattern intent="treatment_guideline">Keywords: "treatment", "management", "guidelines", "protocol", "first-line"</pattern>
      <pattern intent="comparative_analysis">Keywords: "vs", "versus", "compare", "better", "difference"</pattern>
      <pattern intent="mechanism">Keywords: "how", "mechanism", "pathophysiology", "works"</pattern>
      <pattern intent="dosing">Keywords: "dose", "dosing", "administration", "how much"</pattern>
      <pattern intent="adverse_events">Keywords: "side effects", "adverse", "safety", "contraindications"</pattern>
      <pattern intent="diagnostic_criteria">Keywords: "diagnosis", "criteria", "screening", "test"</pattern>
    </patterns>
  </step>
  
  <step number="5">
    <action>Determine required sources using intelligent routing</action>
    <routing_logic>
      <if_condition>Query mentions specific countries, organizations, or "guidelines"</if_condition>
      <then>Set guidelines: true</then>
      
      <if_condition>Query asks about research evidence, efficacy, trials</if_condition>
      <then>Set pubmed: true</then>
      
      <if_condition>Query asks about specific drug information, dosing, FDA data</if_condition>
      <then>Set dailymed: true</then>
      
      <if_condition>Query contains temporal markers indicating need for recent information</if_condition>
      <then>Set recent_web: true</then>
    </routing_logic>
  </step>
  
  <step number="6">
    <action>Calculate complexity score</action>
    <factors>
      <factor weight="0.3">Number of medical entities (diseases, drugs, procedures)</factor>
      <factor weight="0.2">Presence of comparative language</factor>
      <factor weight="0.2">Specificity of clinical context</factor>
      <factor weight="0.2">Potential for contradictory evidence</factor>
      <factor weight="0.1">Query length and detail</factor>
    </factors>
  </step>
</processing_workflow>

<examples>
  <example>
    <input>"What is the first-line treatment for T2DM according to Indian guidelines?"</input>
    <output>
{
  "intent": "treatment_guideline",
  "entities": {
    "diseases": ["Type 2 Diabetes Mellitus", "Diabetes Mellitus Type 2", "Non-insulin-dependent diabetes"],
    "drugs": [],
    "procedures": []
  },
  "abbreviations_expanded": {
    "T2DM": "Type 2 Diabetes Mellitus"
  },
  "search_variants": [
    "Type 2 Diabetes Mellitus first-line treatment India ICMR guidelines",
    "T2DM initial therapy Indian clinical practice guidelines metformin",
    "Diabetes management protocol India pharmacological intervention primary care",
    "Type 2 diabetes treatment algorithm India endocrine society recommendations"
  ],
  "requires_sources": {
    "guidelines": true,
    "pubmed": true,
    "dailymed": false,
    "recent_web": false
  },
  "temporal_markers": [],
  "complexity_score": 0.4
}
    </output>
    <reasoning>Simple single-disease guideline query with clear geographic focus</reasoning>
  </example>
  
  <example>
    <input>"Compare apixaban vs rivaroxaban for stroke prevention in AF patients with CKD"</input>
    <output>
{
  "intent": "comparative_analysis",
  "entities": {
    "diseases": ["Atrial Fibrillation", "Chronic Kidney Disease", "Stroke"],
    "drugs": ["Apixaban", "Rivaroxaban", "Factor Xa inhibitors", "Direct oral anticoagulants"],
    "procedures": ["Stroke prevention", "Anticoagulation therapy"]
  },
  "abbreviations_expanded": {
    "AF": "Atrial Fibrillation",
    "CKD": "Chronic Kidney Disease"
  },
  "search_variants": [
    "Apixaban versus rivaroxaban atrial fibrillation chronic kidney disease stroke prevention",
    "Direct oral anticoagulants comparison AF CKD renal impairment bleeding risk",
    "Factor Xa inhibitors effectiveness safety atrial fibrillation kidney disease",
    "DOAC comparative effectiveness research stroke prevention renal function"
  ],
  "requires_sources": {
    "guidelines": true,
    "pubmed": true,
    "dailymed": true,
    "recent_web": false
  },
  "temporal_markers": [],
  "complexity_score": 0.8
}
    </output>
    <reasoning>Complex comparative query involving multiple conditions and drug comparison</reasoning>
  </example>
</examples>

<critical_requirements>
  <requirement>NEVER output anything other than valid JSON</requirement>
  <requirement>ALWAYS expand every medical abbreviation found</requirement>
  <requirement>ALWAYS generate exactly 3-5 search variants</requirement>
  <requirement>ALWAYS include complexity_score as a float between 0.0 and 1.0</requirement>
  <requirement>NEVER assume information not present in the query</requirement>
  <requirement>ALWAYS use precise medical terminology in entity extraction</requirement>
</critical_requirements>

<quality_assurance>
  <check>Verify all abbreviations are expanded correctly</check>
  <check>Ensure search variants are semantically diverse but equivalent</check>
  <check>Confirm intent classification matches query characteristics</check>
  <check>Validate source requirements align with query needs</check>
  <check>Verify complexity score reflects actual query complexity</check>
</quality_assurance>`;
  }

  async analyzeQuery(query: string, traceContext: TraceContext): Promise<AgentResult<QueryAnalysis>> {
    const startTime = Date.now();

    try {
      const prompt = `User Query: ${query}\n\nOutput JSON:`;

      const response = await this.model.generateContent(prompt, {
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json"
        }
      });

      const analysis = JSON.parse(response.response.text()) as QueryAnalysis;
      const latency = Date.now() - startTime;

      // Calculate cost (approximate)
      const tokens = {
        input: response.response.usageMetadata?.promptTokenCount || 500,
        output: response.response.usageMetadata?.candidatesTokenCount || 800,
        total: response.response.usageMetadata?.totalTokenCount || 1300
      };

      const cost = this.calculateCost(tokens);

      const result: AgentResult<QueryAnalysis> = {
        success: true,
        data: analysis,
        latency_ms: latency,
        tokens,
        cost_usd: cost
      };

      // Log to Arize
      await logAgent(
        'query_intelligence',
        traceContext,
        { query },
        analysis,
        result,
        'gemini-3.0-flash-thinking'
      );

      return result;

    } catch (error) {
      const latency = Date.now() - startTime;
      const result: AgentResult<QueryAnalysis> = {
        success: false,
        data: {} as QueryAnalysis,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency_ms: latency
      };

      await logAgent(
        'query_intelligence',
        traceContext,
        { query },
        { error: result.error },
        result,
        'gemini-3.0-flash-thinking'
      );

      return result;
    }
  }

  private calculateCost(tokens: { input: number; output: number }): number {
    // Gemini 3.0 Flash pricing: $0.075/1M input, $0.30/1M output
    const inputCost = (tokens.input / 1_000_000) * 0.075;
    const outputCost = (tokens.output / 1_000_000) * 0.30;
    return inputCost + outputCost;
  }
}