/**
 * Agent 7: Verification Gate
 * Final validation that synthesis is grounded in evidence
 * Uses Gemini 3.0 Flash for fast verification
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { SynthesisResult, VerificationResult, TraceContext, AgentResult } from './types';
import { logAgent, logHallucination } from '../observability/arize-client';

export class VerificationGate {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private fallbackModel: any;
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 3;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview',
      systemInstruction: this.getSystemPrompt()
    });
    
    // Fallback to Gemini 3.0 Pro if Flash is overloaded
    this.fallbackModel = this.genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
      systemInstruction: this.getSystemPrompt()
    });
  }

  private getSystemPrompt(): string {
    return `<role>
  <identity>Medical Evidence Verification Specialist</identity>
  <purpose>Validate medical syntheses against source evidence to prevent hallucination and ensure citation accuracy</purpose>
  <expertise>Evidence validation, citation verification, hallucination detection, medical fact-checking, grounding assessment</expertise>
</role>

<core_mission>
  <primary_goal>Ensure every claim in medical synthesis is properly grounded in provided evidence sources</primary_goal>
  <success_criteria>
    <criterion>Identify all unsupported claims that lack proper evidence grounding</criterion>
    <criterion>Verify all citations correspond to actual evidence sources</criterion>
    <criterion>Detect hallucinated information not present in source materials</criterion>
    <criterion>Calculate accurate grounding scores reflecting synthesis reliability</criterion>
    <criterion>Provide actionable feedback for improving evidence grounding</criterion>
  </success_criteria>
</core_mission>

<verification_framework>
  <validation_dimensions>
    <dimension name="citation_completeness">
      <description>Every factual claim must have corresponding inline citation</description>
      <assessment>
        <check>Identify sentences making factual claims</check>
        <check>Verify each claim has [N] citation format</check>
        <check>Flag uncited claims as potential hallucinations</check>
      </assessment>
      <exceptions>
        <exception>Introductory/transitional sentences without factual content</exception>
        <exception>Concluding statements that summarize already-cited information</exception>
      </exceptions>
    </dimension>
    
    <dimension name="citation_validity">
      <description>All citation numbers must correspond to actual evidence sources</description>
      <assessment>
        <check>Extract all [N] citation numbers from synthesis</check>
        <check>Verify each N corresponds to a source in evidence pack</check>
        <check>Flag invalid citation numbers as errors</check>
      </assessment>
    </dimension>
    
    <dimension name="semantic_grounding">
      <description>Claims must be semantically supported by cited sources</description>
      <assessment>
        <check>Extract claim text and associated citation numbers</check>
        <check>Retrieve corresponding source texts</check>
        <check>Assess semantic entailment between claim and sources</check>
        <check>Flag claims that go beyond or contradict source content</check>
      </assessment>
      <grounding_levels>
        <level name="direct">Claim directly stated in source text</level>
        <level name="inferential">Claim reasonably inferred from source data</level>
        <level name="extrapolated">Claim extends beyond source content (flag as unsupported)</level>
        <level name="contradictory">Claim contradicts source content (flag as hallucination)</level>
      </grounding_levels>
    </dimension>
    
    <dimension name="medical_accuracy">
      <description>Medical facts must be accurately represented from sources</description>
      <assessment>
        <check>Verify numerical data matches source exactly</check>
        <check>Confirm drug names and dosages are accurate</check>
        <check>Validate medical terminology usage</check>
        <check>Check statistical significance reporting</check>
      </assessment>
    </dimension>
  </validation_dimensions>
</verification_framework>

<grounding_assessment>
  <semantic_entailment_check>
    <process>
      <step>Extract individual factual claims from synthesis</step>
      <step>Identify citation numbers for each claim</step>
      <step>Retrieve corresponding source texts</step>
      <step>Assess logical relationship between claim and sources</step>
      <step>Classify as: SUPPORTED, PARTIALLY_SUPPORTED, UNSUPPORTED, CONTRADICTED</step>
    </process>
    
    <classification_criteria>
      <supported>Claim directly stated or clearly implied by source content</supported>
      <partially_supported>Claim partially supported but missing key elements</partially_supported>
      <unsupported>Claim not found in or reasonably inferred from sources</unsupported>
      <contradicted>Claim directly contradicts information in sources</contradicted>
    </classification_criteria>
  </semantic_entailment_check>
  
  <grounding_score_calculation>
    <formula>
      grounding_score = (fully_supported_claims + 0.5 * partially_supported_claims) / total_factual_claims
    </formula>
    <interpretation>
      <score range="0.9-1.0">Excellent grounding - minimal concerns</score>
      <score range="0.8-0.89">Good grounding - minor issues</score>
      <score range="0.7-0.79">Moderate grounding - notable concerns</score>
      <score range="0.6-0.69">Poor grounding - major issues</score>
      <score range="0.0-0.59">Unacceptable grounding - significant hallucination</score>
    </interpretation>
  </grounding_score_calculation>
</grounding_assessment>

<output_specification>
  <response_format>
    <success_case>
      <condition>grounding_score ≥ 0.8 AND no critical violations</condition>
      <action>Return synthesis unchanged with verification metadata</action>
    </success_case>
    
    <warning_case>
      <condition>0.7 ≤ grounding_score < 0.8 OR minor violations detected</condition>
      <action>Return synthesis with warning message describing issues</action>
    </warning_case>
    
    <rejection_case>
      <condition>grounding_score < 0.7 OR critical violations detected</condition>
      <action>Return synthesis with strong warning and detailed issue description</action>
    </rejection_case>
  </response_format>
  
  <verification_metadata>
    <field name="total_claims" type="integer">Count of factual claims identified</field>
    <field name="cited_claims" type="integer">Count of claims with citations</field>
    <field name="uncited_claims" type="array">List of claims lacking citations</field>
    <field name="invalid_citations" type="array">Citation numbers not in evidence pack</field>
    <field name="unsupported_claims" type="array">Claims not grounded in cited sources</field>
    <field name="hallucination_detected" type="boolean">Whether significant hallucination found</field>
    <field name="grounding_score" type="float">Overall grounding quality (0.0-1.0)</field>
    <field name="passed" type="boolean">Whether synthesis meets quality standards</field>
  </verification_metadata>
</output_specification>

<verification_workflow>
  <step number="1">
    <action>Parse synthesis into individual sentences</action>
    <process>
      <substep>Split text on sentence boundaries</substep>
      <substep>Identify sentences containing factual claims</substep>
      <substep>Exclude purely transitional or introductory sentences</substep>
    </process>
  </step>
  
  <step number="2">
    <action>Extract and validate citations</action>
    <process>
      <substep>Find all [N] citation patterns in text</substep>
      <substep>Extract unique citation numbers</substep>
      <substep>Verify each number corresponds to evidence source</substep>
      <substep>Flag invalid citation numbers</substep>
    </process>
  </step>
  
  <step number="3">
    <action>Identify uncited factual claims</action>
    <process>
      <substep>Scan each sentence for medical facts, statistics, recommendations</substep>
      <substep>Check if sentence contains citation</substep>
      <substep>Flag factual claims without citations</substep>
    </process>
  </step>
  
  <step number="4">
    <action>Perform semantic grounding assessment</action>
    <process>
      <substep>For each cited claim, retrieve corresponding source texts</substep>
      <substep>Assess semantic entailment using LLM reasoning</substep>
      <substep>Classify grounding level (supported/partial/unsupported/contradicted)</substep>
      <substep>Flag unsupported or contradicted claims</substep>
    </process>
  </step>
  
  <step number="5">
    <action>Calculate overall grounding score</action>
    <process>
      <substep>Count claims by grounding classification</substep>
      <substep>Apply grounding score formula</substep>
      <substep>Determine pass/warning/fail status</substep>
    </process>
  </step>
  
  <step number="6">
    <action>Generate verification report and recommendations</action>
    <process>
      <substep>Summarize key issues found</substep>
      <substep>Provide specific examples of problems</substep>
      <substep>Generate actionable improvement suggestions</substep>
    </process>
  </step>
</verification_workflow>

<examples>
  <example>
    <scenario>Well-grounded synthesis with proper citations</scenario>
    <synthesis_excerpt>Metformin reduces HbA1c by 1.0-1.5% in patients with Type 2 diabetes [1][2]. The UKPDS study demonstrated cardiovascular benefits with 20-year follow-up [3].</synthesis_excerpt>
    <verification_result>
      <grounding_assessment>Both claims directly supported by cited sources</grounding_assessment>
      <grounding_score>1.0</grounding_score>
      <status>PASSED</status>
    </verification_result>
  </example>
  
  <example>
    <scenario>Synthesis with unsupported claim</scenario>
    <synthesis_excerpt>Metformin is the most prescribed diabetes medication worldwide. Studies show it reduces HbA1c by 1.0-1.5% [1].</synthesis_excerpt>
    <verification_result>
      <grounding_assessment>First sentence lacks citation and not supported by evidence. Second sentence properly grounded.</grounding_assessment>
      <grounding_score>0.5</grounding_score>
      <status>WARNING - Uncited claim detected</status>
    </verification_result>
  </example>
  
  <example>
    <scenario>Synthesis with contradictory information</scenario>
    <synthesis_excerpt>Apixaban shows superior efficacy to rivaroxaban in stroke prevention [1].</synthesis_excerpt>
    <verification_result>
      <grounding_assessment>Source [1] states non-inferiority, not superiority. Claim contradicts evidence.</grounding_assessment>
      <grounding_score>0.0</grounding_score>
      <status>FAILED - Contradictory claim detected</status>
    </verification_result>
  </example>
</examples>

<critical_requirements>
  <requirement>NEVER approve synthesis with grounding_score < 0.7</requirement>
  <requirement>ALWAYS flag claims that contradict source evidence</requirement>
  <requirement>ALWAYS verify citation numbers correspond to actual sources</requirement>
  <requirement>NEVER ignore uncited factual claims</requirement>
  <requirement>ALWAYS provide specific examples in verification feedback</requirement>
</critical_requirements>

<quality_assurance>
  <validation_checklist>
    <check>All factual claims identified and assessed</check>
    <check>Citation validation completed for all [N] references</check>
    <check>Semantic grounding assessed for all cited claims</check>
    <check>Grounding score calculated correctly</check>
    <check>Verification status assigned appropriately</check>
    <check>Specific examples provided for any issues found</check>
  </validation_checklist>
</quality_assurance>`;
  }

  async verify(
    synthesis: SynthesisResult,
    traceContext: TraceContext
  ): Promise<AgentResult<SynthesisResult>> {
    const startTime = Date.now();

    try {
      // Circuit breaker: Skip verification if too many consecutive failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.log('⚠️ Verification circuit breaker activated - skipping verification due to consecutive failures');
        return {
          data: synthesis,
          metadata: {
            agent: 'verification_gate',
            latency: Date.now() - startTime,
            model_used: 'skipped',
            cost: 0
          },
          warning: '⚠️ Verification skipped due to model overload - please verify claims manually'
        };
      }

      // Extract claims from synthesis
      const claims = this.extractClaims(synthesis.synthesis);
      
      // Initialize validation results
      const validationResults: VerificationResult = {
        total_claims: claims.length,
        cited_claims: 0,
        uncited_claims: [],
        invalid_citations: [],
        unsupported_claims: [],
        hallucination_detected: false,
        grounding_score: 0,
        passed: false
      };

      // Parse citations from synthesis - handle both [[N]](URL) and [N] patterns
      const citationPatterns = [
        /\[\[(\d+)\]\]\([^)]+\)/g,  // [[N]](URL) format (primary)
        /\[(\d+)\]/g                // [N] format (fallback)
      ];
      
      const citedClaims: Array<[string, string]> = [];
      const citedNumbers = new Set<number>();
      
      // Extract citations using both patterns
      for (const pattern of citationPatterns) {
        let match;
        while ((match = pattern.exec(synthesis.synthesis)) !== null) {
          const citationNumber = parseInt(match[1]);
          citedNumbers.add(citationNumber);
        }
      }
      
      // Find claims with citations by looking for sentences containing citation patterns
      const sentences = synthesis.synthesis.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const hasCitation = citationPatterns.some(pattern => {
          pattern.lastIndex = 0; // Reset regex
          return pattern.test(sentence);
        });
        
        if (hasCitation) {
          // Extract citation numbers from this sentence
          const sentenceCitations: number[] = [];
          for (const pattern of citationPatterns) {
            pattern.lastIndex = 0; // Reset regex
            let match;
            while ((match = pattern.exec(sentence)) !== null) {
              sentenceCitations.push(parseInt(match[1]));
            }
          }
          
          if (sentenceCitations.length > 0) {
            citedClaims.push([sentence.trim(), sentenceCitations.join(',')]);
          }
        }
      }

      validationResults.cited_claims = citedClaims.length;

      // Check for uncited claims
      for (const claim of claims) {
        const hasCitation = citedClaims.some(([citedClaim]) => 
          claim.includes(citedClaim.trim()) || citedClaim.includes(claim.trim())
        );
        
        if (!hasCitation) {
          validationResults.uncited_claims.push(claim);
        }
      }

      // Validate citations exist in evidence pack
      const validNumbers = new Set(synthesis.citations.map(c => c.number));
      const invalidNumbers = Array.from(citedNumbers).filter(n => !validNumbers.has(n));
      validationResults.invalid_citations = invalidNumbers;

      // Grounding check (semantic similarity)
      for (const [claim, numbersStr] of citedClaims) {
        const numbers = numbersStr.split(',').map(n => parseInt(n.trim()));
        
        // Get cited sources
        const citedSources = synthesis.evidence_pack.filter(source => 
          numbers.includes(source.rank)
        );
        
        // Check if claim is grounded
        const isGrounded = await this.checkGrounding(claim, citedSources);
        
        if (!isGrounded) {
          validationResults.unsupported_claims.push({
            claim,
            citations: numbers
          });
        }
      }

      // Determine if validation passed
      validationResults.hallucination_detected = (
        validationResults.unsupported_claims.length > 0 ||
        validationResults.uncited_claims.length > 2 // Allow 2 uncited claims for intro/conclusion
      );

      validationResults.passed = !validationResults.hallucination_detected;

      // Calculate grounding score
      if (validationResults.total_claims > 0) {
        const unsupportedRatio = validationResults.unsupported_claims.length / validationResults.total_claims;
        const uncitedRatio = Math.max(0, validationResults.uncited_claims.length - 2) / validationResults.total_claims;
        validationResults.grounding_score = Math.max(0, 1.0 - unsupportedRatio - uncitedRatio * 0.5);
      } else {
        validationResults.grounding_score = 1.0;
      }

      const latency = Date.now() - startTime;

      // Log verification results to Arize
      await logAgent(
        'verification_gate',
        traceContext,
        { synthesis_length: synthesis.synthesis.length },
        validationResults,
        {
          success: true,
          data: validationResults,
          latency_ms: latency
        },
        'gemini-3-flash-preview'
      );

      // Log hallucination detection
      await logHallucination(
        traceContext,
        synthesis.synthesis,
        synthesis.evidence_pack,
        validationResults
      );

      // Add warnings if needed
      let finalSynthesis = synthesis;
      if (!validationResults.passed) {
        const warning = this.generateWarning(validationResults);
        finalSynthesis = {
          ...synthesis,
          warning
        };
        
        console.log(`⚠️ Verification failed: ${warning}`);
      } else {
        console.log(`✅ Verification passed: ${Math.round(validationResults.grounding_score * 100)}% grounding score`);
      }

      console.log(`🔍 Verification complete:`);
      console.log(`   Total claims: ${validationResults.total_claims}`);
      console.log(`   Cited claims: ${validationResults.cited_claims}`);
      console.log(`   Uncited claims: ${validationResults.uncited_claims.length}`);
      console.log(`   Unsupported claims: ${validationResults.unsupported_claims.length}`);
      console.log(`   Grounding score: ${Math.round(validationResults.grounding_score * 100)}%`);

      return {
        success: true,
        data: finalSynthesis,
        latency_ms: latency,
        metadata: {
          verification: validationResults
        }
      };

    } catch (error) {
      console.error('❌ Verification failed:', error);
      
      const latency = Date.now() - startTime;
      const result: AgentResult<SynthesisResult> = {
        success: false,
        data: synthesis,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency_ms: latency
      };

      await logAgent(
        'verification_gate',
        traceContext,
        { synthesis_length: synthesis.synthesis.length },
        { error: result.error },
        result,
        'verification_failed'
      );

      // Return synthesis with warning
      return {
        ...result,
        success: true,
        data: {
          ...synthesis,
          warning: '⚠️ Verification process failed - please review citations carefully'
        }
      };
    }
  }

  private extractClaims(text: string): string[] {
    // Split text into individual claims (sentences)
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    // Filter out very short sentences (likely fragments)
    const claims = sentences
      .map(s => s.trim())
      .filter(s => s.length > 20 && !s.match(/^(however|therefore|in conclusion|finally)/i));
    
    return claims;
  }

  private async checkGrounding(claim: string, citedSources: any[]): Promise<boolean> {
    if (citedSources.length === 0) return false;

    // Combine source texts (limit for performance)
    const sourceTexts = citedSources
      .slice(0, 3) // Limit to top 3 sources
      .map(source => source.text?.slice(0, 500) || '') // Limit text length
      .filter(text => text.length > 0);
    
    if (sourceTexts.length === 0) return false;
    
    const combinedSources = sourceTexts.join('\n\n');

    // Use Gemini for semantic entailment check
    const prompt = `Is the following claim supported by the provided evidence?

Claim: ${claim}

Evidence:
${combinedSources}

Answer ONLY 'YES' or 'NO'. If the claim is a reasonable inference from the evidence, answer YES. If the claim contradicts or goes beyond the evidence, answer NO.`;

    try {
      let response;
      let modelUsed = 'gemini-3-flash-preview';
      
      // Add timeout wrapper (15 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Verification timeout')), 15000)
      );
      
      try {
        // Try Gemini 3.0 Flash first with timeout
        const primaryPromise = this.model.generateContent(prompt, {
          generationConfig: { temperature: 0 }
        });
        
        response = await Promise.race([primaryPromise, timeoutPromise]);
      } catch (primaryError) {
        // If Gemini 3.0 Flash fails, try Pro with timeout
        if (primaryError instanceof Error && (primaryError.message.includes('overloaded') || primaryError.message.includes('timeout'))) {
          console.log('⚠️ Gemini 3.0 Flash overloaded/timeout for verification, trying 3.0 Pro...');
          modelUsed = 'gemini-3-pro-preview';
          
          try {
            const fallbackPromise = this.fallbackModel.generateContent(prompt, {
              generationConfig: { temperature: 0 }
            });
            
            response = await Promise.race([fallbackPromise, timeoutPromise]);
          } catch (fallbackError) {
            console.log('⚠️ Both Gemini models failed for verification, skipping grounding check');
            this.consecutiveFailures++;
            return false; // Skip verification if both models fail
          }
        } else {
          throw primaryError;
        }
      }

      const answer = response.response.text().trim().toUpperCase();
      this.consecutiveFailures = 0; // Reset on success
      return answer === 'YES';
    } catch (error) {
      console.error('❌ Grounding check failed:', error);
      this.consecutiveFailures++;
      return false; // Conservative: assume not grounded if check fails
    }
  }

  private generateWarning(validationResults: VerificationResult): string {
    const warnings: string[] = [];

    if (validationResults.uncited_claims.length > 2) {
      warnings.push(`${validationResults.uncited_claims.length - 2} claims lack citations`);
    }

    if (validationResults.invalid_citations.length > 0) {
      warnings.push(`Invalid citation numbers: ${validationResults.invalid_citations.join(', ')}`);
    }

    if (validationResults.unsupported_claims.length > 0) {
      warnings.push(`${validationResults.unsupported_claims.length} claims may not be fully supported by evidence`);
    }

    return `⚠️ ${warnings.join(' | ')}`;
  }
}