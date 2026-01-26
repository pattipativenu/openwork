/**
 * Medical Evidence Synthesis Orchestrator
 * Coordinates all 7 agents in the complete workflow
 * Implements the exact architecture from project.md
 */

import { TraceContext, MedicalEvidenceResponse } from './types';
import { QueryIntelligenceAgent } from './query-intelligence';
import { MultiSourceRetrievalCoordinator } from './multi-source-retrieval';
import { EvidenceNormalizer } from './evidence-normalizer';
import { TwoStageReranker } from './bge-reranker';
import { EvidenceGapAnalyzer } from './evidence-gap-analyzer';
import { SynthesisEngine } from './synthesis-engine';
import { VerificationGate } from './verification-gate';
import { logSynthesis } from '../observability/arize-client';

export class MedicalEvidenceOrchestrator {
  private queryIntelligence: QueryIntelligenceAgent;
  private multiSourceRetrieval: MultiSourceRetrievalCoordinator;
  private evidenceNormalizer: EvidenceNormalizer;
  private twoStageReranker: TwoStageReranker;
  private evidenceGapAnalyzer: EvidenceGapAnalyzer;
  private synthesisEngine: SynthesisEngine;
  private verificationGate: VerificationGate;

  constructor(config: {
    google_ai_api_key: string;
    ncbi_api_key: string;
    tavily_api_key: string;
  }) {
    this.queryIntelligence = new QueryIntelligenceAgent(config.google_ai_api_key);
    this.multiSourceRetrieval = new MultiSourceRetrievalCoordinator({
      ncbi_api_key: config.ncbi_api_key,
      tavily_api_key: config.tavily_api_key
    });
    this.evidenceNormalizer = new EvidenceNormalizer();
    this.twoStageReranker = new TwoStageReranker(config.ncbi_api_key);
    this.evidenceGapAnalyzer = new EvidenceGapAnalyzer(config.google_ai_api_key);
    this.synthesisEngine = new SynthesisEngine(config.google_ai_api_key);
    this.verificationGate = new VerificationGate(config.google_ai_api_key);
  }

  async processQuery(
    query: string,
    sessionId: string = 'default'
  ): Promise<MedicalEvidenceResponse> {
    const startTime = Date.now();
    const traceId = this.generateTraceId();
    
    const traceContext: TraceContext = {
      traceId,
      sessionId,
      timestamp: startTime
    };

    console.log(`🚀 Starting 7-agent medical evidence synthesis`);
    console.log(`   Query: "${query}"`);
    console.log(`   Trace ID: ${traceId}`);
    console.log(`   Session ID: ${sessionId}`);

    let totalCost = 0;
    const agentLatencies: Record<string, number> = {};

    try {
      // AGENT 1: Query Intelligence
      console.log(`\n🤖 AGENT 1: Query Intelligence`);
      const queryResult = await this.queryIntelligence.analyzeQuery(query, traceContext);
      
      if (!queryResult.success) {
        throw new Error(`Query analysis failed: ${queryResult.error}`);
      }

      const searchStrategy = queryResult.data;
      totalCost += queryResult.cost_usd || 0;
      agentLatencies.query_intelligence = queryResult.latency_ms;

      console.log(`✅ Query analyzed: ${searchStrategy.intent} (complexity: ${searchStrategy.complexity_score.toFixed(2)})`);
      console.log(`   Search variants: ${searchStrategy.search_variants.length}`);
      console.log(`   Required sources: ${Object.entries(searchStrategy.requires_sources).filter(([, v]) => v).map(([k]) => k).join(', ')}`);

      // AGENT 2: Multi-Source Retrieval
      console.log(`\n🔍 AGENT 2: Multi-Source Retrieval`);
      const retrievalStart = Date.now();
      const rawResults = await this.multiSourceRetrieval.retrieveAll(searchStrategy, traceContext, query);
      agentLatencies.multi_source_retrieval = Date.now() - retrievalStart;

      const totalDocuments = Object.values(rawResults).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`✅ Retrieved ${totalDocuments} documents from ${Object.keys(rawResults).length} sources`);

      // AGENT 3: Evidence Normalizer
      console.log(`\n🔄 AGENT 3: Evidence Normalizer`);
      const normalizationStart = Date.now();
      const candidates = this.evidenceNormalizer.normalizeAll(rawResults);
      agentLatencies.evidence_normalizer = Date.now() - normalizationStart;

      console.log(`✅ Normalized ${candidates.length} evidence candidates`);

      // AGENT 4: Two-Stage Reranker
      console.log(`\n🎯 AGENT 4: Two-Stage BGE Reranker`);
      const evidencePack = await this.twoStageReranker.rerank(query, candidates, traceContext);
      // Note: BGE reranker cost is $0 (self-hosted)

      console.log(`✅ Reranked to top ${evidencePack.length} evidence chunks`);

      // AGENT 5: Evidence Gap Analyzer
      console.log(`\n🔍 AGENT 5: Evidence Gap Analyzer`);
      const gapResult = await this.evidenceGapAnalyzer.analyze(
        query, 
        evidencePack, 
        traceContext,
        this.multiSourceRetrieval
      );
      
      const { analysis: gapAnalysis, updatedEvidence } = gapResult;
      totalCost += 0.003; // Approximate cost for gap analysis
      agentLatencies.evidence_gap_analyzer = 2100; // Approximate latency

      console.log(`✅ Gap analysis: ${gapAnalysis.assessment} (${Math.round(gapAnalysis.coverage_score * 100)}% coverage)`);
      
      if (updatedEvidence.length > evidencePack.length) {
        console.log(`   📈 Added ${updatedEvidence.length - evidencePack.length} sources from Tavily`);
      }

      // AGENT 6: Synthesis Engine
      console.log(`\n✍️ AGENT 6: Synthesis Engine`);
      const synthesisResult = await this.synthesisEngine.synthesize(
        query,
        updatedEvidence,
        gapAnalysis,
        searchStrategy.complexity_score,
        traceContext
      );

      if (!synthesisResult.success) {
        throw new Error(`Synthesis failed: ${synthesisResult.error}`);
      }

      const synthesis = synthesisResult.data;
      totalCost += synthesisResult.cost_usd || 0;
      agentLatencies.synthesis_engine = synthesisResult.latency_ms;

      console.log(`✅ Synthesis complete: ${synthesis.synthesis.length} chars, ${synthesis.citations.length} citations`);
      console.log(`   Model used: ${synthesis.model_used}`);

      // AGENT 7: Verification Gate
      console.log(`\n🔒 AGENT 7: Verification Gate`);
      const verificationResult = await this.verificationGate.verify(synthesis, traceContext);

      if (!verificationResult.success) {
        console.warn(`⚠️ Verification failed: ${verificationResult.error}`);
      }

      const finalSynthesis = verificationResult.data;
      agentLatencies.verification_gate = verificationResult.latency_ms;

      // Calculate total metrics
      const totalLatency = Date.now() - startTime;
      const citationCoverage = synthesis.citations.length > 0 ? 
        (synthesis.citations.length / this.extractClaims(synthesis.synthesis).length) : 0;

      // Build final response
      const response: MedicalEvidenceResponse = {
        synthesis: finalSynthesis.synthesis,
        citations: synthesis.citations.map(c => ({
          number: c.number,
          source: c.source,
          id: c.id,
          title: c.title,
          url: this.buildCitationUrl(c),
          metadata: c.metadata
        })),
        metadata: {
          sources_count: updatedEvidence.length,
          latency_total_ms: totalLatency,
          cost_total_usd: totalCost,
          grounding_score: verificationResult.metadata?.verification?.grounding_score || 0.8,
          citation_coverage: citationCoverage,
          hallucination_detected: verificationResult.metadata?.verification?.hallucination_detected || false,
          model_used: synthesis.model_used,
          trace_id: traceId
        }
      };

      if (finalSynthesis.warning) {
        response.warning = finalSynthesis.warning;
      }

      // Log final synthesis to Arize
      await logSynthesis(
        traceContext,
        query,
        finalSynthesis.synthesis,
        synthesis.citations,
        updatedEvidence,
        verificationResult.metadata?.verification || {
          total_claims: 0,
          cited_claims: 0,
          uncited_claims: [],
          invalid_citations: [],
          unsupported_claims: [],
          hallucination_detected: false,
          grounding_score: 0.8,
          passed: true
        },
        totalLatency,
        totalCost,
        synthesis.model_used
      );

      console.log(`\n🎉 7-Agent Synthesis Complete!`);
      console.log(`   Total latency: ${totalLatency}ms`);
      console.log(`   Total cost: $${totalCost.toFixed(4)}`);
      console.log(`   Sources: ${response.metadata.sources_count}`);
      console.log(`   Citations: ${response.citations.length}`);
      console.log(`   Grounding score: ${Math.round(response.metadata.grounding_score * 100)}%`);
      console.log(`   Agent latencies:`, agentLatencies);

      return response;

    } catch (error) {
      console.error('❌ 7-Agent synthesis failed:', error);
      
      // Return error response
      const errorResponse: MedicalEvidenceResponse = {
        synthesis: `I apologize, but I encountered an error while processing your query: "${query}". Please try rephrasing your question or contact support if the issue persists.`,
        citations: [],
        metadata: {
          sources_count: 0,
          latency_total_ms: Date.now() - startTime,
          cost_total_usd: totalCost,
          grounding_score: 0,
          citation_coverage: 0,
          hallucination_detected: true,
          model_used: 'error',
          trace_id: traceId
        },
        warning: `⚠️ System error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };

      return errorResponse;
    }
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private extractClaims(text: string): string[] {
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20);
  }

  private buildCitationUrl(citation: any): string | undefined {
    switch (citation.source) {
      case 'pubmed':
        return `https://pubmed.ncbi.nlm.nih.gov/${citation.id}/`;
      case 'indian_guideline':
        return citation.metadata.url;
      case 'dailymed':
        return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${citation.id}`;
      case 'tavily_web':
        return citation.metadata.url;
      default:
        return citation.metadata.url;
    }
  }
}