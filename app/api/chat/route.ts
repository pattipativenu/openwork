import { NextRequest, NextResponse } from "next/server";
import { withChatSpan, generateSessionId, type StreamingSpanResult, type Span } from "@/lib/otel";

// 7-Agent Medical Evidence Synthesis System (Primary)
import { MedicalEvidenceOrchestrator } from '@/lib/agents/medical-evidence-orchestrator';

export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Initialize 7-Agent Medical Evidence Orchestrator (Primary System)
const orchestrator = new MedicalEvidenceOrchestrator({
  google_ai_api_key: process.env.GEMINI_API_KEY!,
  ncbi_api_key: process.env.NCBI_API_KEY || '',
  tavily_api_key: process.env.TAVILY_API_KEY || ''
});

// Helper function to build references section for UI
function buildReferencesSection(citations: any[]): string {
  if (citations.length === 0) return '';
  
  let referencesSection = '\n\n## References\n\n';
  
  citations.forEach(citation => {
    const metadata = citation.metadata;
    
    // Build reference entry
    referencesSection += `${citation.number}. [${citation.title}](${metadata.url || '#'})\n`;
    
    // Add authors if available
    if (metadata.authors && metadata.authors.length > 0) {
      const authorList = metadata.authors.slice(0, 3).join(', ');
      const etAl = metadata.authors.length > 3 ? ', et al.' : '';
      referencesSection += `   Authors: ${authorList}${etAl}\n`;
    }
    
    // Add journal and year
    if (metadata.journal || metadata.year) {
      referencesSection += `   Journal: ${metadata.journal || 'Unknown'}. ${metadata.year || 'Unknown'}.\n`;
    }
    
    // Add identifiers
    const identifiers = [];
    if (metadata.pmid) identifiers.push(`PMID: ${metadata.pmid}`);
    if (metadata.pmcid) identifiers.push(`PMCID: ${metadata.pmcid}`);
    if (metadata.doi) identifiers.push(`DOI: ${metadata.doi}`);
    
    if (identifiers.length > 0) {
      referencesSection += `   ${identifiers.join(' | ')}\n`;
    }
    
    // Add badges
    if (metadata.badges && metadata.badges.length > 0) {
      const badgeText = metadata.badges.map((badge: string) => `[${badge}]`).join(' - ');
      referencesSection += `   ${badgeText}\n`;
    }
    
    referencesSection += '\n';
  });
  
  return referencesSection;
}

export async function POST(request: NextRequest) {
  try {
    const { messages, mode, files, sessionId: clientSessionId, isStudyMode } = await request.json();
    const message = messages && messages.length > 0 ? messages[messages.length - 1].content : '';

    // Use client-provided session ID or generate new one
    const sessionId = clientSessionId || generateSessionId();

    // Use manual lifecycle for streaming - we control when span ends
    const spanResult = await withChatSpan(
      message,
      mode || 'doctor', // Default to doctor since general mode is removed
      sessionId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (span, _captureOutput) => {
        span.setAttribute('chat.has_files', !!(files && files.length > 0));
        span.setAttribute('chat.session_id', sessionId);

        // Build the response but pass span controls for stream lifecycle
        return await handleChatRequest(messages, mode, files, span, sessionId, isStudyMode);
      },
      { manualLifecycle: true }
    ) as StreamingSpanResult<Response>;

    // Return the response - span lifecycle managed by stream handlers
    return spanResult.result;

  } catch (error) {
    console.error("❌ Error parsing request body:", error);
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }
}

async function handleChatRequest(
  messages: ChatMessage[],
  mode: string,
  files: string[] | undefined,
  span: Span,
  sessionId: string,
  isStudyMode: boolean = false
): Promise<Response> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API key is missing." }, { status: 500 });
    }

    const message = messages[messages.length - 1].content;

    // NEW: Use 7-Agent Medical Evidence Synthesis System
    console.log(`🚀 Using 7-Agent Medical Evidence Synthesis for query: "${message}"`);
    
    try {
      const evidenceResponse = await orchestrator.processQuery(message, sessionId);
      
      // Stream the response
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send metadata first
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              sessionId, 
              model: evidenceResponse.metadata.model_used,
              sources_count: evidenceResponse.metadata.sources_count,
              cost: evidenceResponse.metadata.cost_total_usd,
              latency: evidenceResponse.metadata.latency_total_ms,
              grounding_score: evidenceResponse.metadata.grounding_score
            })}\n\n`));

            // Stream the synthesis text with inline citations
            const synthesis = evidenceResponse.synthesis;
            const chunkSize = 50; // Characters per chunk
            
            for (let i = 0; i < synthesis.length; i += chunkSize) {
              const chunk = synthesis.slice(i, i + chunkSize);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
              
              // Small delay to simulate streaming
              await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Build and stream references section
            if (evidenceResponse.citations.length > 0) {
              const referencesSection = buildReferencesSection(evidenceResponse.citations);
              
              // Stream references section in chunks
              const refChunkSize = 100;
              for (let i = 0; i < referencesSection.length; i += refChunkSize) {
                const chunk = referencesSection.slice(i, i + refChunkSize);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
                await new Promise(resolve => setTimeout(resolve, 30));
              }
              
              // Send citations metadata for UI components (for hover cards, etc.)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                citations: evidenceResponse.citations 
              })}\n\n`));
            }

            // Send warning if present
            if (evidenceResponse.warning) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                warning: evidenceResponse.warning 
              })}\n\n`));
            }

            // Set span attributes
            span.setAttribute("output.value", synthesis);
            span.setAttribute("output.mime_type", "text/plain");
            span.setAttribute("evidence.sources_count", evidenceResponse.metadata.sources_count);
            span.setAttribute("evidence.cost_usd", evidenceResponse.metadata.cost_total_usd);
            span.setAttribute("evidence.grounding_score", evidenceResponse.metadata.grounding_score);
            span.setAttribute("evidence.hallucination_detected", evidenceResponse.metadata.hallucination_detected);

            span.setStatus({ code: 0 });
            span.end();

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

          } catch (streamError) {
            console.error("❌ Streaming error:", streamError);
            span.setStatus({ code: 1, message: streamError instanceof Error ? streamError.message : "Stream error" });
            span.end();
            controller.error(streamError);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "X-Session-ID": sessionId,
          "X-Evidence-Sources": evidenceResponse.metadata.sources_count.toString(),
          "X-Grounding-Score": evidenceResponse.metadata.grounding_score.toString()
        },
      });

    } catch (orchestratorError) {
      console.error("❌ 7-Agent orchestrator failed:", orchestratorError);
      
      // Set error status and return error response
      span.setStatus({ code: 1, message: orchestratorError instanceof Error ? orchestratorError.message : "Orchestrator Error" });
      span.end();
      
      return NextResponse.json({ 
        error: "Medical evidence synthesis system temporarily unavailable", 
        details: orchestratorError instanceof Error ? orchestratorError.message : "Unknown error" 
      }, { status: 500 });
    }

  } catch (error) {
    console.error("❌ Chat request error:", error);
    span.setStatus({ code: 1, message: error instanceof Error ? error.message : "API Error" });
    span.end();
    return NextResponse.json({ error: "Failed to generate response", details: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
