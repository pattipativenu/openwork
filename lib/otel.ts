/**
 * OpenTelemetry Configuration for MedGuidance-AI with Arize Phoenix
 * 
 * Fixed approach with proper session management and OpenInference conventions
 * UPDATED: Span lifecycle management for streaming responses
 */

import { trace, SpanStatusCode, Span, SpanKind, context } from "@opentelemetry/api";

// Phoenix endpoint (local server)
const COLLECTOR_ENDPOINT = process.env.PHOENIX_COLLECTOR_ENDPOINT || "http://localhost:6006";
const PROJECT_NAME = process.env.OTEL_SERVICE_NAME || "medguidance-ai";

let isInitialized = false;

/**
 * Initialize Phoenix OpenTelemetry with working OpenAI instrumentation
 */
export async function initObservability(): Promise<void> {
    if (isInitialized) {
        console.log("🔭 Phoenix OpenTelemetry already initialized");
        return;
    }

    try {
        // Use the Phoenix register function with proper configuration
        const { register } = await import("@arizeai/phoenix-otel");
        const { OpenAIInstrumentation } = await import("@arizeai/openinference-instrumentation-openai");

        // Create OpenAI instrumentation - uses defaults which include token tracking
        const openaiInstrumentation = new OpenAIInstrumentation();

        // Register with Phoenix using the correct API
        register({
            projectName: PROJECT_NAME,
            // INCREASE LIMITS to prevent JSON truncation which crashes Phoenix UI
            spanAttributeValueLengthLimit: 16384, // 16KB limit
            spanAttributeCountLimit: 256,
        });

        // Manually instrument OpenAI client (preferred for Next.js)
        const OpenAI = await import("openai");
        openaiInstrumentation.manuallyInstrument(OpenAI.default);

        isInitialized = true;

        console.log(`🔭 Phoenix OpenTelemetry initialized successfully`);
        console.log(`   📡 Endpoint: ${COLLECTOR_ENDPOINT}/v1/traces`);
        console.log(`   🏷️  Project: ${PROJECT_NAME}`);
        console.log(`   🤖 OpenAI instrumentation: ENABLED`);

    } catch (error) {
        console.error("❌ Failed to initialize Phoenix OpenTelemetry:", error);
    }
}

/**
 * Get a tracer instance for creating spans
 */
export function getTracer(name: string = "medguidance-ai") {
    return trace.getTracer(name, '1.0.0');
}

/**
 * Generate a session ID for grouping traces together
 */
export function generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Result type for streaming chat operations
 */
export interface StreamingSpanResult<T> {
    result: T;
    span: Span;
    endSpan: () => void;
    captureOutputAndEnd: (output: string) => void;
}

/**
 * Create the root span for a chat interaction using proper OpenInference conventions
 * This creates a CHAIN span that orchestrates the LLM call and tool usage
 * 
 * For streaming responses, set `manualLifecycle: true` and call
 * `captureOutputAndEnd()` when the stream completes.
 */
export async function withChatSpan<T>(
    userMessage: string,
    mode: string,
    sessionId: string,
    fn: (span: Span, captureOutput: (output: string) => void) => Promise<T>,
    options: { manualLifecycle?: boolean } = {}
): Promise<T | StreamingSpanResult<T>> {
    const tracer = getTracer();
    const { manualLifecycle = false } = options;

    return tracer.startActiveSpan("chat", {
        kind: SpanKind.SERVER,
        attributes: {
            // OpenInference semantic conventions - CHAIN for orchestration layer
            "openinference.span.kind": "CHAIN",
            "session.id": sessionId,
            "user.id": "anonymous",
            // Input capture for dashboard
            "input.value": userMessage,
            "input.mime_type": "text/plain",
            // Custom attributes
            "medguidance.mode": mode,
            "medguidance.message_preview": userMessage.substring(0, 200),
        }
    }, async (span) => {
        let outputCaptured = false;
        let spanEnded = false;

        console.log(`🔍 Starting CHAIN span with session: ${sessionId}`);
        console.log(`📝 Input captured: ${userMessage.substring(0, 100)}...`);

        // Create output capture function
        const captureOutput = (output: string) => {
            if (spanEnded) {
                console.log(`⚠️ Span already ended, cannot capture output`);
                return;
            }
            try {
                console.log(`🎯 CAPTURING OUTPUT: ${output.length} characters`);
                span.setAttribute("output.value", output);
                span.setAttribute("output.mime_type", "text/plain");
                outputCaptured = true;
                console.log(`📝 Output captured: ${output.substring(0, 100)}...`);
            } catch (error) {
                console.error("❌ Failed to capture output:", error);
            }
        };

        // End span function
        const endSpan = () => {
            if (spanEnded) return;
            spanEnded = true;
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            console.log(`🔚 Span ended (output captured: ${outputCaptured})`);
        };

        // Combined capture and end function for streaming
        const captureOutputAndEnd = (output: string) => {
            captureOutput(output);
            endSpan();
        };

        try {
            // Import session utilities
            const { setSession } = await import("@arizeai/openinference-core");

            // Set session context for all child spans
            const result = await context.with(
                setSession(context.active(), { sessionId }),
                async () => {
                    return await fn(span, captureOutput);
                }
            );

            // If manual lifecycle, return control handles to caller
            if (manualLifecycle) {
                return {
                    result,
                    span,
                    endSpan,
                    captureOutputAndEnd,
                };
            }

            // Auto-end span for non-streaming cases
            endSpan();
            return result;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`❌ CHAIN span error: ${errorMessage}`);
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
            span.recordException(error instanceof Error ? error : new Error(errorMessage));
            if (!spanEnded) {
                spanEnded = true;
                span.end();
            }
            throw error;
        }
    });
}

/**
 * Helper function to capture token usage using OpenInference conventions
 */
export function captureTokenUsage(
    span: Span,
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
    modelName?: string
) {
    try {
        if (usage.prompt_tokens) {
            span.setAttribute("llm.token_count.prompt", usage.prompt_tokens);
        }
        if (usage.completion_tokens) {
            span.setAttribute("llm.token_count.completion", usage.completion_tokens);
        }
        if (usage.total_tokens) {
            span.setAttribute("llm.token_count.total", usage.total_tokens);
        }
        if (modelName) {
            span.setAttribute("llm.model_name", modelName);
        }
        console.log(`💰 Token usage captured: ${usage.total_tokens} total tokens (model: ${modelName || 'unknown'})`);
    } catch (error) {
        console.error("❌ Failed to capture token usage:", error);
    }
}

/**
 * Create a tool span for tracking external tool calls
 */
export async function withToolSpan<T>(
    toolName: string,
    operation: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const tracer = getTracer();

    return tracer.startActiveSpan(`tool.${toolName}`, {
        kind: SpanKind.CLIENT,
        attributes: {
            "openinference.span.kind": "TOOL",
            "tool.name": toolName,
            "tool.description": `${toolName} ${operation}`,
            ...attributes
        }
    }, async (span) => {
        try {
            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
            span.recordException(error instanceof Error ? error : new Error(errorMessage));
            throw error;
        } finally {
            span.end();
        }
    });
}

/**
 * Create a manual LLM span for OpenAI calls (fixes Cost calculation in Phoenix)
 */
export async function withLLMSpan<T>(
    modelName: string,
    userPrompt: string,
    sessionId: string,
    fn: (span: Span, captureOutput: (output: string) => void) => Promise<T>,
    options: { manualLifecycle?: boolean } = {}
): Promise<T | StreamingSpanResult<T>> {
    const tracer = getTracer();
    const { manualLifecycle = false } = options;

    return tracer.startActiveSpan("openai.chat", {
        kind: SpanKind.CLIENT,
        attributes: {
            "openinference.span.kind": "LLM",
            "llm.model_name": modelName,
            // Use plain text for input - Phoenix displays this in the list view
            "input.value": userPrompt,
            "input.mime_type": "text/plain",
            "session.id": sessionId
        }
    }, async (span) => {
        let outputCaptured = false;
        let spanEnded = false;

        const captureOutput = (output: string) => {
            if (spanEnded) return;
            try {
                span.setAttribute("output.value", output);
                span.setAttribute("output.mime_type", "text/plain");
                outputCaptured = true;
            } catch (ignore) { }
        };

        const endSpan = () => {
            if (spanEnded) return;
            spanEnded = true;
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
        };

        const captureOutputAndEnd = (output: string) => {
            captureOutput(output);
            endSpan();
        };

        try {
            // Execute function
            const result = await fn(span, captureOutput);

            if (manualLifecycle) {
                return {
                    result,
                    span,
                    endSpan,
                    captureOutputAndEnd
                } as StreamingSpanResult<T>;
            }

            endSpan();
            return result;
        } catch (error: any) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            span.end();
            throw error;
        }
    });
}

/**
 * Record feedback/evaluation result for a trace (e.g. Hallucination score)
 */
export async function recordFeedback(
    traceId: string,
    spanId: string,
    score: number,
    label: string,
    reason: string
) {
    try {
        const payload = {
            span_id: spanId,
            name: label,
            score: score,
            label: score > 0.8 ? "clean" : (score < 0.5 ? "hallucinated" : "uncertain"),
            explanation: reason,
            metadata: {
                timestamp: new Date().toISOString()
            }
        };

        fetch(`${COLLECTOR_ENDPOINT}/v1/span_annotations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error("❌ Failed to send feedback to Phoenix:", err));

        console.log(`📝 Feedback recorded: ${label} = ${score}`);
    } catch (error) {
        console.error("❌ Error recording feedback:", error);
    }
}

// --- RAG SPECIFIC HELPERS ---

/**
 * Standard interface for a retrieved document in Phoenix
 */
export interface PhoenixDocument {
    id: string;
    content: string; // The main text (abstract/body)
    score?: number;
    metadata?: Record<string, any>; // Title, URL, Date, Source
}

/**
 * Create a RETRIEVER span for tracking RAG retrieval steps
 * Ensures ALL retrieved documents are logged for inspection
 */
/**
 * Helper to truncate document content for Phoenix visualization
 * Prevents "Payload too large" errors and UI crashes
 */
function truncateDocumentsForTrace(documents: PhoenixDocument[]): PhoenixDocument[] {
    return documents.map(doc => {
        // Create a shallow copy first
        const newDoc: PhoenixDocument = { ...doc };

        // Truncate main content even more aggressively for Phoenix UI stability
        if (newDoc.content && newDoc.content.length > 300) {
            newDoc.content = newDoc.content.substring(0, 300) + '... (truncated)';
        }

        // Truncate metadata fields if they are large strings
        if (newDoc.metadata) {
            const newMetadata = { ...newDoc.metadata };
            for (const key in newMetadata) {
                const val = newMetadata[key];
                if (typeof val === 'string' && val.length > 200) {
                    newMetadata[key] = val.substring(0, 200) + '... (truncated)';
                }
            }
            newDoc.metadata = newMetadata;
        }

        return newDoc;
    });
}

/**
 * Create a RETRIEVER span for tracking RAG retrieval steps
 * Ensures ALL retrieved documents are logged for inspection
 */
export async function withRetrieverSpan<T>(
    stepName: string,
    fn: (span: Span) => Promise<{ result: T; documents: PhoenixDocument[] }>,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const tracer = getTracer();
    return tracer.startActiveSpan(stepName, {
        kind: SpanKind.INTERNAL,
        attributes: {
            "openinference.span.kind": "RETRIEVER",
            ...attributes
        }
    }, async (span) => {
        try {
            const { result, documents } = await fn(span);

            // Log the document count
            span.setAttribute("retrieval.documents.count", documents.length);

            // Serialize documents for Phoenix visualization
            // Phoenix expects the `retrieval.documents` attribute to contain the list of docs
            if (documents.length > 0) {
                // TRUNCATE CONTENT prevents JSON truncation and UI crashes
                const safeDocs = truncateDocumentsForTrace(documents);
                span.setAttribute("retrieval.documents", JSON.stringify(safeDocs));
                console.log(`📚 Captured ${documents.length} docs for ${stepName}`);
            }

            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error: any) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            throw error;
        } finally {
            span.end();
        }
    });
}

/**
 * Create a RERANKER span
 * Visualizes the reranking process (Input vs Output)
 */
export async function withRerankerSpan<T>(
    stepName: string,
    inputDocuments: PhoenixDocument[],
    fn: (span: Span) => Promise<{ result: T; rerankedDocuments: PhoenixDocument[] }>,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const tracer = getTracer();

    // TRUNCATE INPUTS immediately to safely store in attributes
    const safeInputDocs = truncateDocumentsForTrace(inputDocuments);

    return tracer.startActiveSpan(stepName, {
        kind: SpanKind.INTERNAL,
        attributes: {
            "openinference.span.kind": "RERANKER",
            "rerank.input_documents.count": inputDocuments.length,
            "rerank.input_documents": JSON.stringify(safeInputDocs),
            ...attributes
        }
    }, async (span) => {
        try {
            const { result, rerankedDocuments } = await fn(span);

            span.setAttribute("rerank.output_documents.count", rerankedDocuments.length);

            // TRUNCATE OUTPUTS
            const safeOutputDocs = truncateDocumentsForTrace(rerankedDocuments);
            span.setAttribute("retrieval.documents", JSON.stringify(safeOutputDocs)); // Standard output for reranker

            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error: any) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            throw error;
        } finally {
            span.end();
        }
    });
}

// Export OpenTelemetry API for direct use
export { trace, SpanStatusCode, SpanKind, context };
export type { Span };
