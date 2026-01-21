/**
 * Arize AI Integration for Open Work Medical Evidence Synthesis
 * TypeScript implementation with proper space ID integration
 */

import { TraceContext, AgentResult, VerificationResult } from '../agents/types';

interface ArizeLogEntry {
  prediction_id: string;
  prediction_timestamp: number;
  agent_name?: string;
  model_name?: string;
  input?: string;
  output?: string;
  latency_ms?: number;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  grounding_score?: number;
  citation_coverage?: number;
  hallucination_detected?: boolean;
  query?: string;
  synthesis?: string;
  num_sources?: number;
  num_citations?: number;
  total_latency_ms?: number;
  total_cost_usd?: number;
  session_id?: string;
  trace_id?: string;
}

export class ArizeClient {
  private readonly spaceKey: string;
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.arize.com';
  
  constructor() {
    this.spaceKey = process.env.ARIZE_SPACE_KEY || 'U3BhY2U6MzU0OTI6eDNPMQ==';
    this.apiKey = process.env.ARIZE_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('⚠️ ARIZE_API_KEY not set - observability disabled');
    } else {
      console.log(`✅ Arize client initialized with space: ${this.spaceKey}`);
    }
  }

  /**
   * Log individual agent execution to Arize
   */
  async logAgentExecution(
    agentName: string,
    traceContext: TraceContext,
    input: any,
    output: any,
    result: AgentResult,
    modelName?: string
  ): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const logEntry: ArizeLogEntry = {
        prediction_id: `${traceContext.traceId}_${agentName}`,
        prediction_timestamp: traceContext.timestamp,
        agent_name: agentName,
        model_name: modelName || 'N/A',
        input: JSON.stringify(input),
        output: JSON.stringify(output),
        latency_ms: result.latency_ms,
        cost_usd: result.cost_usd || 0,
        session_id: traceContext.sessionId,
        trace_id: traceContext.traceId,
      };

      if (result.tokens) {
        logEntry.input_tokens = result.tokens.input;
        logEntry.output_tokens = result.tokens.output;
        logEntry.total_tokens = result.tokens.total;
      }

      await this.sendToArize('agent_execution', logEntry);
      console.log(`✅ Logged ${agentName} execution to Arize`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to log ${agentName} to Arize:`, error);
      return false;
    }
  }

  /**
   * Log final end-to-end synthesis with all metrics
   */
  async logFinalSynthesis(
    traceContext: TraceContext,
    query: string,
    synthesis: string,
    citations: any[],
    evidencePack: any[],
    validation: VerificationResult,
    totalLatency: number,
    totalCost: number,
    modelUsed: string
  ): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const logEntry: ArizeLogEntry = {
        prediction_id: traceContext.traceId,
        prediction_timestamp: traceContext.timestamp,
        query,
        synthesis,
        num_sources: evidencePack.length,
        num_citations: citations.length,
        grounding_score: validation.grounding_score,
        citation_coverage: validation.cited_claims / validation.total_claims,
        hallucination_detected: validation.hallucination_detected,
        total_latency_ms: totalLatency,
        total_cost_usd: totalCost,
        model_name: modelUsed,
        session_id: traceContext.sessionId,
        trace_id: traceContext.traceId,
      };

      await this.sendToArize('final_synthesis', logEntry);
      console.log(`✅ Logged final synthesis to Arize`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to log final synthesis to Arize:`, error);
      return false;
    }
  }

  /**
   * Log retrieval metrics for sub-agents
   */
  async logRetrievalMetrics(
    source: string,
    traceContext: TraceContext,
    query: string,
    numResults: number,
    latencyMs: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const logEntry: ArizeLogEntry = {
        prediction_id: `${traceContext.traceId}_retrieval_${source}`,
        prediction_timestamp: traceContext.timestamp,
        agent_name: `retrieval_${source}`,
        input: query,
        output: JSON.stringify({ num_results: numResults, ...metadata }),
        latency_ms: latencyMs,
        session_id: traceContext.sessionId,
        trace_id: traceContext.traceId,
      };

      await this.sendToArize('retrieval_metrics', logEntry);
      return true;

    } catch (error) {
      console.error(`❌ Failed to log retrieval metrics for ${source}:`, error);
      return false;
    }
  }

  /**
   * Log hallucination detection results
   */
  async logHallucinationDetection(
    traceContext: TraceContext,
    synthesis: string,
    evidencePack: any[],
    validation: VerificationResult
  ): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const logEntry: ArizeLogEntry = {
        prediction_id: `${traceContext.traceId}_hallucination`,
        prediction_timestamp: traceContext.timestamp,
        agent_name: 'hallucination_detector',
        input: synthesis,
        output: JSON.stringify({
          grounding_score: validation.grounding_score,
          citation_coverage: validation.cited_claims / validation.total_claims,
          hallucination_detected: validation.hallucination_detected,
          unsupported_claims: validation.unsupported_claims.length,
          uncited_claims: validation.uncited_claims.length,
        }),
        grounding_score: validation.grounding_score,
        citation_coverage: validation.cited_claims / validation.total_claims,
        hallucination_detected: validation.hallucination_detected,
        num_sources: evidencePack.length,
        session_id: traceContext.sessionId,
        trace_id: traceContext.traceId,
      };

      await this.sendToArize('hallucination_detection', logEntry);
      return true;

    } catch (error) {
      console.error(`❌ Failed to log hallucination detection:`, error);
      return false;
    }
  }

  /**
   * Send data to Arize API
   */
  private async sendToArize(endpoint: string, data: ArizeLogEntry): Promise<void> {
    if (!this.apiKey) return;

    try {
      // For now, we'll use a simple HTTP POST to Arize
      // In production, you'd use the official Arize SDK
      const response = await fetch(`${this.baseUrl}/v1/log`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Space-Key': this.spaceKey,
        },
        body: JSON.stringify({
          model_id: process.env.ARIZE_MODEL_ID || 'open-work-medical-synthesis',
          model_version: process.env.ARIZE_MODEL_VERSION || 'v1.0.0',
          environment: 'production',
          data: [data],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      // Log error but don't throw - observability shouldn't break the main flow
      console.error(`⚠️ Arize logging failed for ${endpoint}:`, error);
    }
  }
}

// Singleton instance
let arizeClient: ArizeClient | null = null;

export function getArizeClient(): ArizeClient {
  if (!arizeClient) {
    arizeClient = new ArizeClient();
  }
  return arizeClient;
}

// Convenience functions
export async function logAgent(
  agentName: string,
  traceContext: TraceContext,
  input: any,
  output: any,
  result: AgentResult,
  modelName?: string
): Promise<boolean> {
  return getArizeClient().logAgentExecution(agentName, traceContext, input, output, result, modelName);
}

export async function logSynthesis(
  traceContext: TraceContext,
  query: string,
  synthesis: string,
  citations: any[],
  evidencePack: any[],
  validation: VerificationResult,
  totalLatency: number,
  totalCost: number,
  modelUsed: string
): Promise<boolean> {
  return getArizeClient().logFinalSynthesis(
    traceContext, query, synthesis, citations, evidencePack,
    validation, totalLatency, totalCost, modelUsed
  );
}

export async function logRetrieval(
  source: string,
  traceContext: TraceContext,
  query: string,
  numResults: number,
  latencyMs: number,
  metadata?: Record<string, any>
): Promise<boolean> {
  return getArizeClient().logRetrievalMetrics(source, traceContext, query, numResults, latencyMs, metadata);
}

export async function logHallucination(
  traceContext: TraceContext,
  synthesis: string,
  evidencePack: any[],
  validation: VerificationResult
): Promise<boolean> {
  return getArizeClient().logHallucinationDetection(traceContext, synthesis, evidencePack, validation);
}