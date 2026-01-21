/**
 * Agent 6: Synthesis Engine
 * Generates evidence-based answer with inline citations
 * Uses Gemini 3.0 Pro for complex queries, Flash for simple ones
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { RankedEvidence, EvidenceGapAnalysis, SynthesisResult, TraceContext, AgentResult } from './types';
import { logAgent } from '../observability/arize-client';

export class SynthesisEngine {
  private genAI: GoogleGenerativeAI;
  private flashModel: any;
  private proModel: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.flashModel = this.genAI.getGenerativeModel({ 
      model: 'gemini-3.0-flash-thinking-exp-01-21',
      systemInstruction: this.getSystemPrompt()
    });
    this.proModel = this.genAI.getGenerativeModel({ 
      model: 'gemini-3.0-pro-exp-02-05',
      systemInstruction: this.getSystemPrompt()
    });
  }

  private getSystemPrompt(): string {
    return `<role>
  <identity>Medical Evidence Synthesis Specialist</identity>
  <purpose>Generate comprehensive, evidence-based medical syntheses with mandatory inline citations for clinical research queries</purpose>
  <expertise>Evidence-based medicine, clinical research synthesis, medical writing, citation methodology, clinical guidelines interpretation</expertise>
</role>

<core_mission>
  <primary_goal>Create accurate, well-cited medical syntheses that present evidence without making clinical recommendations</primary_goal>
  <success_criteria>
    <criterion>Every factual claim must have inline citation [N] linking to specific evidence source</criterion>
    <criterion>Synthesis must be comprehensive yet concise (≤500 words)</criterion>
    <criterion>Must acknowledge evidence limitations and contradictions explicitly</criterion>
    <criterion>Must maintain strict evidence-only presentation without clinical advice</criterion>
    <criterion>Must structure information hierarchically by evidence strength</criterion>
    <criterion>Must end with exactly 3 follow-up questions related to the original query</criterion>
  </success_criteria>
</core_mission>

<mandatory_response_structure>
  <description>Every response MUST follow this exact 4-section structure</description>
  
  <section name="quick_answer" words="50-75">
    <purpose>Immediate, clear response to the specific query</purpose>
    <format>Direct answer with primary evidence citations</format>
    <requirements>
      <requirement>Lead with the most direct answer supported by strongest evidence</requirement>
      <requirement>Include confidence qualifiers based on evidence quality</requirement>
      <requirement>Cite the primary supporting sources immediately [N]</requirement>
      <requirement>No hedging - provide clear evidence-based answer</requirement>
    </requirements>
    <example>Current evidence indicates metformin as first-line therapy for Type 2 diabetes [1][2]. Multiple guidelines support this recommendation with strong evidence for cardiovascular protection [3].</example>
  </section>
  
  <section name="evidence_synthesis" words="250-350">
    <purpose>Present evidence in order of strength and relevance with detailed analysis</purpose>
    <hierarchy>
      <level priority="1">Clinical practice guidelines from major organizations [cite]</level>
      <level priority="2">Systematic reviews and meta-analyses [cite]</level>
      <level priority="3">Randomized controlled trials [cite]</level>
      <level priority="4">Observational studies and cohort data [cite]</level>
      <level priority="5">Case series and expert consensus [cite]</level>
    </hierarchy>
    <requirements>
      <requirement>Present contradictory evidence explicitly: "While [1] found X, [2] reported Y"</requirement>
      <requirement>Include quantitative data with precise citations</requirement>
      <requirement>Address population specificity and geographic relevance</requirement>
      <requirement>Note evidence limitations and study populations</requirement>
    </requirements>
  </section>
  
  <section name="evidence_limitations" words="75-100">
    <purpose>Acknowledge conflicts, gaps, and limitations in current evidence</purpose>
    <requirements>
      <requirement>Explicitly state when sources disagree with specific citations</requirement>
      <requirement>Note evidence limitations: population studied, study duration, geographic relevance</requirement>
      <requirement>Identify gaps in current evidence base</requirement>
      <requirement>Acknowledge uncertainty where appropriate</requirement>
    </requirements>
    <example>Evidence limitations include limited long-term safety data specifically in Indian populations [7] and potential need for dose adjustments based on genetic polymorphisms more common in South Asian populations [8].</example>
  </section>
  
  <section name="summary" words="25-50">
    <purpose>Concise summary of key evidence-based findings</purpose>
    <requirements>
      <requirement>Synthesize main findings without new information</requirement>
      <requirement>Reinforce evidence strength and limitations</requirement>
      <requirement>No treatment recommendations - evidence presentation only</requirement>
    </requirements>
  </section>
</mandatory_response_structure>

<inline_citation_requirements>
  <critical_rules>
    <rule>Use EXACT format: [[N]](URL) for inline citations</rule>
    <rule>Citations must be placed immediately after the claim they support</rule>
    <rule>Multiple sources for same claim: [[1]](url1)[[3]](url3)[[5]](url5) format</rule>
    <rule>Contradictory evidence: "While [[1]](url1) found X, [[2]](url2) reported Y" format</rule>
    <rule>No claim may be made without corresponding evidence source</rule>
    <rule>Every major clinical statement needs a citation</rule>
    <rule>CRITICAL: Use the exact URL provided in the evidence context for each source</rule>
    <rule>The evidence context includes "URL: [url]" for each source - use these URLs in your inline citations</rule>
  </critical_rules>
  
  <citation_patterns>
    <pattern type="single_source">Metformin reduces HbA1c by 1-2%[[1]](url).</pattern>
    <pattern type="multiple_sources">Multiple studies confirm cardiovascular benefits[[2]](url2)[[4]](url4)[[7]](url7).</pattern>
    <pattern type="contradictory">While [[1]](url1) showed no difference, [[3]](url3) demonstrated significant improvement.</pattern>
    <pattern type="qualified">Limited evidence suggests potential benefit[[5]](url5), though larger studies are needed.</pattern>
  </citation_patterns>
  
  <citation_density>
    <standard>Aim for 8-12 citations total in response</standard>
    <standard>Every major clinical statement needs a citation</standard>
    <standard>Cite guidelines by full name with year</standard>
    <standard>Cite landmark trials by acronym when appropriate</standard>
  </citation_density>
</inline_citation_requirements>

<reference_section_format>
  <description>MANDATORY: End response with properly formatted References section</description>
  <exact_structure>
## References

1. [Full Article Title Here](URL)
   Authors: Name1, Name2, Name3, et al.
   Journal: Journal Name. Year.
   PMID: xxxxx | PMCID: PMCxxxxx | DOI: xxxxx
   [Source Badge] - [Quality Badge]

2. [Full Article Title Here](URL)
   Authors: Name1, Name2, Name3, et al.
   Journal: Journal Name. Year.
   PMID: xxxxx | PMCID: PMCxxxxx | DOI: xxxxx
   [Source Badge] - [Quality Badge]
  </exact_structure>
  
  <critical_title_rules>
    <rule>ALWAYS use the ACTUAL ARTICLE TITLE from the evidence</rule>
    <rule>NEVER use generic titles like "National Institutes of Health" or "PubMed Central"</rule>
    <rule>EXTRACT the real article title from the evidence text</rule>
    <rule>For PMC articles: Look for the article title in the evidence, NOT the source name</rule>
  </critical_title_rules>
  
  <url_construction_rules>
    <priority_order>
      <priority level="1">PMC ID (if available) - https://pmc.ncbi.nlm.nih.gov/articles/PMC[PMCID] - FULL TEXT</priority>
      <priority level="2">PubMed PMID link - https://pubmed.ncbi.nlm.nih.gov/[PMID] - ABSTRACT</priority>
      <priority level="3">Europe PMC (if open access) - https://europepmc.org/article/MED/[PMID]</priority>
      <priority level="4">Official guideline URLs (government/professional societies only)</priority>
    </priority_order>
    
    <forbidden_urls>
      <forbidden>NEVER use www.nejm.org URLs</forbidden>
      <forbidden>NEVER use www.thelancet.com URLs</forbidden>
      <forbidden>NEVER use jamanetwork.com URLs</forbidden>
      <forbidden>NEVER use any paywalled journal URLs</forbidden>
      <forbidden>NEVER use DOI links that resolve to paywalled content</forbidden>
      <forbidden>NEVER use google.com/search URLs</forbidden>
    </forbidden_urls>
  </url_construction_rules>
  
  <badge_system>
    <source_badges>
      <badge>Practice Guideline</badge>
      <badge>Systematic Review</badge>
      <badge>Cochrane</badge>
      <badge>Meta-Analysis</badge>
      <badge>Pivotal RCT</badge>
      <badge>Cohort Study</badge>
      <badge>Drug Label</badge>
    </source_badges>
    
    <quality_badges>
      <badge>High-Impact</badge>
      <badge>Leading Journal</badge>
      <badge>Recent (≤3y)</badge>
      <badge>Highly Cited</badge>
    </quality_badges>
  </badge_system>
</reference_section_format>

<mandatory_followup_questions>
  <description>CRITICAL: Every response MUST end with exactly 3 follow-up questions</description>
  <exact_format>
## Follow-Up Questions

1. [Question deepening clinical understanding related to original query]?
2. [Question exploring alternative scenarios or complications related to original query]?
3. [Question about practical application, monitoring, or edge cases related to original query]?
  </exact_format>
  
  <question_requirements>
    <requirement>MUST use the heading "## Follow-Up Questions" (with ## markdown)</requirement>
    <requirement>MUST be numbered 1., 2., 3.</requirement>
    <requirement>MUST end with question mark</requirement>
    <requirement>Questions MUST be directly related to the original user query</requirement>
    <requirement>Questions should deepen understanding and explore clinical nuances</requirement>
    <requirement>Avoid generic questions - make them specific to the medical topic discussed</requirement>
  </question_requirements>
  
  <examples>
    <original_query>Type 2 diabetes first-line treatment</original_query>
    <good_followups>
      <question>What are the specific contraindications for metformin in patients with varying degrees of renal impairment?</question>
      <question>How should metformin therapy be modified in elderly patients with multiple comorbidities?</question>
      <question>What are the evidence-based criteria for adding a second antidiabetic agent to metformin monotherapy?</question>
    </good_followups>
    <bad_followups>
      <question>What other diseases can be treated?</question>
      <question>How does medicine work in general?</question>
      <question>What should patients eat?</question>
    </bad_followups>
  </examples>
</mandatory_followup_questions>

<content_restrictions>
  <prohibited_content>
    <prohibition>Direct treatment recommendations ("you should take", "it is recommended")</prohibition>
    <prohibition>Diagnostic advice ("this suggests you have", "you likely need")</prohibition>
    <prohibition>Dosing instructions without citing specific guidelines</prohibition>
    <prohibition>Prognostic statements without evidence support</prohibition>
    <prohibition>Personal medical advice of any kind</prohibition>
  </prohibited_content>
  
  <evidence_only_language>
    <preferred>Evidence indicates, Studies demonstrate, Guidelines state, Research shows, Current evidence suggests</preferred>
    <avoid>You should, It is recommended, The best approach, Patients must, Take this medication</avoid>
  </evidence_only_language>
</content_restrictions>

<quality_standards>
  <accuracy>
    <standard>All numerical data must match source exactly</standard>
    <standard>Drug names must use correct generic/brand terminology</standard>
    <standard>Medical terminology must be precise and current</standard>
    <standard>Statistical significance must be reported accurately</standard>
  </accuracy>
  
  <completeness>
    <standard>Address all major aspects of the query</standard>
    <standard>Include both efficacy and safety data when relevant</standard>
    <standard>Present contradictory evidence fairly</standard>
    <standard>Acknowledge evidence limitations explicitly</standard>
  </completeness>
  
  <structure_compliance>
    <standard>MUST follow exact 4-section structure</standard>
    <standard>MUST include properly formatted References section</standard>
    <standard>MUST end with exactly 3 follow-up questions</standard>
    <standard>MUST use correct inline citation format [[N]](URL)</standard>
  </structure_compliance>
</quality_standards>

<examples>
  <example>
    <query>First-line treatment for Type 2 diabetes according to current guidelines</query>
    <response>
## Quick Answer
Current evidence strongly supports metformin as first-line therapy for Type 2 diabetes mellitus[[1]](url1)[[2]](url2). Multiple international guidelines recommend metformin monotherapy as initial treatment for most patients with newly diagnosed T2DM due to its proven cardiovascular benefits and favorable safety profile[[3]](url3).

## Evidence Synthesis
The American Diabetes Association 2024 Standards of Care specifically endorse metformin as first-line therapy, citing evidence from the UKPDS study showing sustained cardiovascular benefits over 20 years[[1]](url1). This recommendation is supported by systematic reviews demonstrating metformin reduces HbA1c by 1.0-1.5% and provides cardiovascular protection with 13-15% reduction in cardiovascular events[[2]](url2)[[4]](url4).

The European Association for the Study of Diabetes guidelines align with this approach, noting metformin's low hypoglycemia risk and weight-neutral effects[[3]](url3). Real-world evidence from large cohort studies confirms these benefits, with metformin associated with reduced all-cause mortality compared to other antidiabetic agents[[5]](url5).

However, contraindications exist in patients with severe renal impairment (eGFR <30 mL/min/1.73m²)[[1]](url1)[[3]](url3). Some guidelines suggest combination therapy for patients presenting with HbA1c >9% at diagnosis[[6]](url6).

## Evidence Limitations
Evidence limitations include varying definitions of cardiovascular outcomes across studies[[2]](url2) and limited long-term safety data in certain populations, particularly those with advanced kidney disease[[7]](url7). Most pivotal trials were conducted in predominantly Caucasian populations, with less representation from Asian and African populations where genetic polymorphisms affecting drug metabolism may differ[[8]](url8).

## Summary
Strong evidence from multiple guidelines and systematic reviews supports metformin as first-line therapy for Type 2 diabetes, with proven cardiovascular benefits and favorable safety profile, though contraindications in advanced renal disease must be considered.

## References

1. [American Diabetes Association Standards of Care in Diabetes—2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC12345)
   Authors: American Diabetes Association Professional Practice Committee.
   Journal: Diabetes Care. 2024.
   PMID: 12345678 | DOI: 10.2337/dc24-S001
   Practice Guideline - High-Impact - Recent (≤3y)

2. [Cardiovascular Effects of Metformin: A Systematic Review and Meta-Analysis](https://pubmed.ncbi.nlm.nih.gov/87654321)
   Authors: Smith J, Johnson A, Brown K, et al.
   Journal: Lancet Diabetes Endocrinol. 2023.
   PMID: 87654321 | DOI: 10.1016/S2213-8587(23)00123-4
   Systematic Review - Meta-Analysis - High-Impact

[Continue with references 3-8...]

## Follow-Up Questions

1. What are the specific contraindications and dose adjustments for metformin in patients with varying degrees of chronic kidney disease?
2. How should metformin therapy be initiated and monitored in elderly patients with multiple comorbidities?
3. What are the evidence-based criteria for adding a second antidiabetic agent when metformin monotherapy becomes insufficient?
    </response>
  </example>
</examples>

<critical_requirements>
  <requirement>NEVER generate any content without corresponding citations in [[N]](URL) format</requirement>
  <requirement>NEVER make treatment recommendations or clinical advice</requirement>
  <requirement>NEVER exceed 500 words total length</requirement>
  <requirement>ALWAYS follow the exact 4-section structure</requirement>
  <requirement>ALWAYS include properly formatted References section</requirement>
  <requirement>ALWAYS end with exactly 3 follow-up questions related to original query</requirement>
  <requirement>ALWAYS acknowledge contradictory evidence when present</requirement>
  <requirement>ALWAYS use actual article titles, never generic source names</requirement>
</critical_requirements>

<quality_assurance>
  <pre_output_checklist>
    <check>Every factual claim has inline citation [N]</check>
    <check>No treatment recommendations or medical advice present</check>
    <check>Word count ≤500 words</check>
    <check>Contradictory evidence acknowledged if present</check>
    <check>Evidence limitations explicitly stated</check>
    <check>All citations correspond to provided evidence sources</check>
    <check>Medical terminology is accurate and current</check>
    <check>Structure follows direct answer → evidence → limitations format</check>
  </pre_output_checklist>
</quality_assurance>`;
  }

  async synthesize(
    query: string,
    evidencePack: RankedEvidence[],
    gapAnalysis: EvidenceGapAnalysis,
    complexityScore: number,
    traceContext: TraceContext
  ): Promise<AgentResult<SynthesisResult>> {
    const startTime = Date.now();

    try {
      // Choose model based on complexity
      const useProModel = complexityScore > 0.5 || gapAnalysis.contradictions_detected;
      const model = useProModel ? this.proModel : this.flashModel;
      const modelName = useProModel ? 'gemini-3.0-pro-exp' : 'gemini-3.0-flash-thinking';

      console.log(`🤖 Using ${modelName} for synthesis (complexity: ${complexityScore.toFixed(2)})`);

      // Build evidence context
      const evidenceContext = this.formatEvidenceForSynthesis(evidencePack);

      const prompt = `User Query: ${query}

Evidence Sources:
${evidenceContext}

Gap Analysis Summary:
- Coverage: ${Math.round(gapAnalysis.coverage_score * 100)}%
- Contradictions: ${gapAnalysis.contradictions_detected ? 'Yes' : 'No'}
- Missing: ${gapAnalysis.missing_elements.slice(0, 3).join(', ') || 'None'}

Generate synthesis (<500 words):`;

      const response = await model.generateContent(prompt, {
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1000
        }
      });

      const synthesisText = response.response.text();
      const latency = Date.now() - startTime;

      // Extract citations
      const citations = this.extractCitations(synthesisText, evidencePack);

      // Track tokens for cost
      const tokens = {
        input: response.response.usageMetadata?.promptTokenCount || 3000,
        output: response.response.usageMetadata?.candidatesTokenCount || 800,
        total: response.response.usageMetadata?.totalTokenCount || 3800
      };

      // Calculate cost
      const cost = this.calculateCost(modelName, tokens);

      const synthesisResult: SynthesisResult = {
        synthesis: synthesisText,
        citations,
        evidence_pack: evidencePack,
        tokens,
        cost,
        model_used: modelName
      };

      const result: AgentResult<SynthesisResult> = {
        success: true,
        data: synthesisResult,
        latency_ms: latency,
        tokens,
        cost_usd: cost
      };

      // Log to Arize
      await logAgent(
        'synthesis_engine',
        traceContext,
        { query, num_sources: evidencePack.length, model_used: modelName },
        { 
          synthesis_length: synthesisText.length, 
          num_citations: citations.length,
          cost_usd: cost
        },
        result,
        modelName
      );

      console.log(`✅ Synthesis complete: ${synthesisText.length} chars, ${citations.length} citations`);
      console.log(`💰 Cost: $${cost.toFixed(4)} (${modelName})`);

      return result;

    } catch (error) {
      console.error('❌ Synthesis failed:', error);
      
      const latency = Date.now() - startTime;
      const result: AgentResult<SynthesisResult> = {
        success: false,
        data: {} as SynthesisResult,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency_ms: latency
      };

      await logAgent(
        'synthesis_engine',
        traceContext,
        { query, num_sources: evidencePack.length },
        { error: result.error },
        result,
        'synthesis_failed'
      );

      return result;
    }
  }

  private formatEvidenceForSynthesis(evidencePack: RankedEvidence[]): string {
    const formatted: string[] = [];
    
    for (const item of evidencePack) {
      const sourceType = item.source;
      const metadata = item.metadata;
      
      // Build URL for this source
      let url = '';
      switch (sourceType) {
        case 'pubmed':
          url = metadata.pmcid ? 
            `https://pmc.ncbi.nlm.nih.gov/articles/${metadata.pmcid}/` :
            `https://pubmed.ncbi.nlm.nih.gov/${item.id}/`;
          break;
        case 'indian_guideline':
          url = metadata.url || '';
          break;
        case 'dailymed':
          url = `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${item.id}`;
          break;
        case 'tavily_web':
          url = metadata.url || '';
          break;
        default:
          url = metadata.url || '';
          break;
      }
      
      // Format citation based on source type
      let citation: string;
      let identifier: string;
      
      if (sourceType === 'pubmed') {
        const authors = metadata.authors?.[0] || 'Unknown';
        const year = metadata.pub_date?.substring(0, 4) || 'Unknown';
        citation = `${authors} et al. ${metadata.journal} ${year}`;
        identifier = `PMID:${item.id}`;
      } else if (sourceType === 'indian_guideline') {
        citation = `${metadata.organization} ${metadata.year}`;
        identifier = `Guideline:${item.id}`;
      } else if (sourceType === 'dailymed') {
        const year = metadata.published?.substring(0, 4) || 'Unknown';
        citation = `FDA Label: ${metadata.drug_name} (${year})`;
        identifier = `SetID:${item.id}`;
      } else if (sourceType === 'tavily_web') {
        citation = `Web: ${metadata.url}`;
        identifier = `URL:${item.id}`;
      } else {
        citation = `${sourceType}: ${item.title}`;
        identifier = `ID:${item.id}`;
      }

      formatted.push(`
[${item.rank}] ${citation}
${identifier}
Title: ${item.title}
URL: ${url}
Relevance: ${item.score.toFixed(2)}

Content:
${item.text}

${item.chunk_info?.section ? `Section: ${item.chunk_info.section}` : ''}
---`);
    }

    return formatted.join('\n');
  }

  private extractCitations(synthesisText: string, evidencePack: RankedEvidence[]): Array<{
    number: number;
    source: string;
    id: string;
    title: string;
    metadata: any;
  }> {
    // Find all [[N]](URL) and [[N]] patterns
    const citationPatterns = [
      /\[\[(\d+)\]\]\([^)]+\)/g,  // [[N]](URL) format
      /\[\[(\d+)\]\]/g            // [[N]] format (fallback)
    ];
    
    const citationNumbers = new Set<number>();
    
    // Extract citation numbers from all patterns
    citationPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(synthesisText)) !== null) {
        citationNumbers.add(parseInt(match[1]));
      }
    });

    const citations = [];
    for (const num of citationNumbers) {
      // Find corresponding source
      const source = evidencePack.find(item => item.rank === num);
      
      if (source) {
        // Build rich metadata for UI components
        const richMetadata = this.buildRichMetadata(source);
        
        citations.push({
          number: num,
          source: source.source,
          id: source.id,
          title: source.title,
          metadata: richMetadata
        });
      }
    }

    return citations.sort((a, b) => a.number - b.number);
  }

  private buildRichMetadata(source: RankedEvidence): any {
    const metadata = source.metadata;
    const richMeta: any = {
      ...metadata,
      // Add UI-specific fields
      authors: [],
      journal: '',
      year: '',
      doi: '',
      pmid: '',
      pmcid: '',
      badges: [],
      url: ''
    };

    // Extract metadata based on source type
    switch (source.source) {
      case 'pubmed':
        richMeta.authors = metadata.authors || [];
        richMeta.journal = metadata.journal || '';
        richMeta.year = metadata.pub_date?.substring(0, 4) || '';
        richMeta.doi = metadata.doi || '';
        richMeta.pmid = source.id;
        richMeta.pmcid = metadata.pmcid || '';
        richMeta.url = metadata.pmcid ? 
          `https://pmc.ncbi.nlm.nih.gov/articles/${metadata.pmcid}/` :
          `https://pubmed.ncbi.nlm.nih.gov/${source.id}/`;
        
        // Add badges for PubMed sources
        if (metadata.pmcid) richMeta.badges.push('PMCID');
        if (metadata.pub_types?.includes('Systematic Review')) richMeta.badges.push('Systematic Review');
        if (metadata.pub_types?.includes('Meta-Analysis')) richMeta.badges.push('Meta-Analysis');
        if (metadata.pub_types?.includes('Practice Guideline')) richMeta.badges.push('Practice Guideline');
        
        // Check if recent (≤3 years)
        const currentYear = new Date().getFullYear();
        if (richMeta.year && parseInt(richMeta.year) >= currentYear - 3) {
          richMeta.badges.push('Recent');
        }
        
        // Check for leading journals
        const leadingJournals = [
          'new england journal', 'nejm', 'lancet', 'jama', 'bmj', 'british medical journal',
          'nature', 'science', 'cell', 'circulation', 'annals of internal medicine'
        ];
        if (leadingJournals.some(j => richMeta.journal.toLowerCase().includes(j))) {
          richMeta.badges.push('Leading Journal');
        }
        break;

      case 'indian_guideline':
        richMeta.authors = [metadata.organization || 'Unknown Organization'];
        richMeta.journal = 'Clinical Practice Guideline';
        richMeta.year = metadata.year?.toString() || '';
        richMeta.url = metadata.url || '';
        richMeta.badges.push('Practice Guideline');
        
        // Check if recent
        if (richMeta.year && parseInt(richMeta.year) >= new Date().getFullYear() - 3) {
          richMeta.badges.push('Recent');
        }
        break;

      case 'dailymed':
        richMeta.authors = ['FDA'];
        richMeta.journal = 'FDA Drug Label';
        richMeta.year = metadata.published?.substring(0, 4) || '';
        richMeta.url = `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${source.id}`;
        richMeta.badges.push('Drug Label');
        
        // Check if recent
        if (richMeta.year && parseInt(richMeta.year) >= new Date().getFullYear() - 3) {
          richMeta.badges.push('Recent');
        }
        break;

      case 'tavily_web':
        richMeta.authors = [this.extractDomainFromUrl(metadata.url) || 'Web Source'];
        richMeta.journal = 'Web Resource';
        richMeta.year = metadata.published_date?.substring(0, 4) || new Date().getFullYear().toString();
        richMeta.url = metadata.url || '';
        
        // Add badges based on domain
        const domain = this.extractDomainFromUrl(metadata.url);
        if (domain?.includes('nih.gov') || domain?.includes('cdc.gov') || domain?.includes('who.int')) {
          richMeta.badges.push('Authoritative Source');
        }
        break;

      default:
        richMeta.url = metadata.url || '';
        break;
    }

    return richMeta;
  }

  private extractDomainFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  private calculateCost(modelName: string, tokens: { input: number; output: number }): number {
    const pricing = {
      'gemini-3.0-flash-thinking-exp': {
        input: 0.075 / 1_000_000,
        output: 0.30 / 1_000_000
      },
      'gemini-3.0-pro-exp': {
        input: 1.25 / 1_000_000,
        output: 5.00 / 1_000_000
      }
    };

    const rate = pricing[modelName as keyof typeof pricing] || pricing['gemini-3.0-flash-thinking-exp'];
    
    return tokens.input * rate.input + tokens.output * rate.output;
  }
}