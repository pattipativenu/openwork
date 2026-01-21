/**
 * OpenTelemetry Configuration for MedGuidance-AI
 *
 * NOTE: Observability is currently disconnected.
 * This file provides no-op stubs to maintain type compatibility.
 */

// Dummy enums/types to match OpenTelemetry API
export enum SpanStatusCode {
    UNSET = 0,
    OK = 1,
    ERROR = 2,
}

export enum SpanKind {
    INTERNAL = 0,
    SERVER = 1,
    CLIENT = 2,
    PRODUCER = 3,
    CONSUMER = 4,
}

export interface Span {
    setAttribute(key: string, value: any): this;
    setStatus(status: { code: SpanStatusCode; message?: string }): this;
    end(): void;
    recordException(exception: any): void;
    spanContext(): { traceId: string; spanId: string };
}

// Dummy context
export const context = {
    active: () => ({}),
    with: <T>(ctx: any, fn: () => T) => fn(),
};

// Dummy trace
export const trace = {
    getTracer: (name: string, version?: string) => ({
        startActiveSpan: async <T>(
            name: string,
            options: any,
            fn: (span: Span) => Promise<T>
        ): Promise<T> => {
            // Create a dummy span
            const span: Span = {
                setAttribute: () => span,
                setStatus: () => span,
                end: () => { },
                recordException: () => { },
                spanContext: () => ({ traceId: 'no-op-trace', spanId: 'no-op-span' }),
            };
            try {
                return await fn(span);
            } catch (error) {
                throw error;
            }
        },
    }),
};

let isInitialized = false;

/**
 * Initialize Observability (No-op)
 */
export async function initObservability(): Promise<void> {
    if (isInitialized) return;
    console.log("🔭 Observability is currently DISCONNECTED");
    isInitialized = true;
}

/**
 * Get a tracer instance (returns dummy)
 */
export function getTracer(name: string = "medguidance-ai") {
    return trace.getTracer(name);
}

/**
 * Generate a session ID
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
 * No-op withChatSpan
 */
export async function withChatSpan<T>(
    userMessage: string,
    mode: string,
    sessionId: string,
    fn: (span: Span, captureOutput: (output: string) => void) => Promise<T>,
    options: { manualLifecycle?: boolean } = {}
): Promise<T | StreamingSpanResult<T>> {
    // Create dummy span and controls
    const span: Span = {
        setAttribute: () => span,
        setStatus: () => span,
        end: () => { },
        recordException: () => { },
        spanContext: () => ({ traceId: 'dummy-trace', spanId: 'dummy-span' }),
    };

    const captureOutput = (output: string) => {
        // No-op logging
        // console.log(`(Stub) Output captured: ${output.length} chars`);
    };

    const endSpan = () => { };
    const captureOutputAndEnd = (output: string) => { };

    const result = await fn(span, captureOutput);

    if (options.manualLifecycle) {
        return {
            result,
            span,
            endSpan,
            captureOutputAndEnd,
        } as unknown as StreamingSpanResult<T>; // Cast needed because T might not match exact structure if T is special
    }

    return result;
}

/**
 * No-op captureTokenUsage
 */
export function captureTokenUsage(
    span: Span,
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
    modelName?: string
) {
    // No-op
}

/**
 * No-op withToolSpan
 */
export async function withToolSpan<T>(
    toolName: string,
    operation: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const span: Span = {
        setAttribute: () => span,
        setStatus: () => span,
        end: () => { },
        recordException: () => { },
        spanContext: () => ({ traceId: 'dummy-trace', spanId: 'dummy-span' }),
    };
    return await fn(span);
}

/**
 * No-op withLLMSpan
 */
export async function withLLMSpan<T>(
    modelName: string,
    userPrompt: string,
    sessionId: string,
    fn: (span: Span, captureOutput: (output: string) => void) => Promise<T>,
    options: { manualLifecycle?: boolean } = {}
): Promise<T | StreamingSpanResult<T>> {
    const span: Span = {
        setAttribute: () => span,
        setStatus: () => span,
        end: () => { },
        recordException: () => { },
        spanContext: () => ({ traceId: 'dummy-trace', spanId: 'dummy-span' }),
    };
    const captureOutput = () => { };
    const endSpan = () => { };
    const captureOutputAndEnd = () => { };

    const result = await fn(span, captureOutput);

    if (options.manualLifecycle) {
        return {
            result,
            span,
            endSpan,
            captureOutputAndEnd,
        } as unknown as StreamingSpanResult<T>;
    }

    return result;
}

/**
 * No-op recordFeedback
 */
export async function recordFeedback(
    traceId: string,
    spanId: string,
    score: number,
    label: string,
    reason: string
) {
    // No-op
}

// --- RAG SPECIFIC HELPERS ---

export interface RetrievedDocument {
    id: string;
    content: string;
    score?: number;
    metadata?: Record<string, any>;
}

/**
 * No-op withRetrieverSpan
 */
export async function withRetrieverSpan<T>(
    stepName: string,
    fn: (span: Span) => Promise<{ result: T; documents: RetrievedDocument[] }>,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const span: Span = {
        setAttribute: () => span,
        setStatus: () => span,
        end: () => { },
        recordException: () => { },
        spanContext: () => ({ traceId: 'dummy-trace', spanId: 'dummy-span' }),
    };
    const { result } = await fn(span);
    return result;
}

/**
 * No-op withRerankerSpan
 */
export async function withRerankerSpan<T>(
    stepName: string,
    inputDocuments: RetrievedDocument[],
    fn: (span: Span) => Promise<{ result: T; rerankedDocuments: RetrievedDocument[] }>,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const span: Span = {
        setAttribute: () => span,
        setStatus: () => span,
        end: () => { },
        recordException: () => { },
        spanContext: () => ({ traceId: 'dummy-trace', spanId: 'dummy-span' }),
    };
    const { result } = await fn(span);
    return result;
}
