import { NextRequest, NextResponse } from "next/server";
import { openai, OPENAI_MODELS } from "@/lib/openai";
import { withChatSpan, withToolSpan, captureTokenUsage, generateSessionId, type StreamingSpanResult, type Span } from "@/lib/otel";
import { getDoctorModePromptSimplified } from "@/lib/prompts/doctor-mode-prompt-simplified";
import { getGeneralModePrompt } from "@/lib/prompts/general-mode-prompt";
import { getStudyModePrompt } from "@/lib/prompts/study-mode-prompt";
import { extractDrugNames } from "@/lib/api/chat-helpers";
import { gatherEvidence, formatEvidenceForPrompt } from '@/lib/evidence/engine';
// import { retrieveMedicalImages, formatMedicalImages } from '@/lib/medical-image-retriever';
import { retrieveGeneralModeImages, formatGeneralModeImages } from '@/lib/general-mode-image-retriever';
import { generateTagsFromQuery } from "@/lib/evidence/pico-extractor";
import { generateHallucinationReport } from '@/lib/evidence/hallucination-detector';
import { recordFeedback, withLLMSpan } from '@/lib/otel';

export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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
      mode || 'general',
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
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key is missing." }, { status: 500 });
    }

    const message = messages[messages.length - 1].content;

    // 1. Evidence Gathering & Image Retrieval (Parallel)
    const drugKeywords = extractDrugNames(message);
    let evidenceContext = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ragEvidence: any = null;
    let medicalImages: Array<{ url: string; title: string; source: string; license: string; thumbnail?: string }> = [];

    // Generate tags for image retrieval
    const picoTags = generateTagsFromQuery(message);
    const healthTopic = picoTags.primary_disease_tag || picoTags.condition || 'General Health';

    await Promise.all([
      // Evidence gathering with tracing
      withToolSpan("evidence-engine", "gather", async (toolSpan) => {
        try {
          ragEvidence = await gatherEvidence(message, drugKeywords);
          evidenceContext += await formatEvidenceForPrompt(ragEvidence, message, ragEvidence.picoTags);

          toolSpan.setAttribute("evidence.sources_count", Object.keys(ragEvidence).length);
          toolSpan.setAttribute("evidence.query", message.substring(0, 200));
          toolSpan.setAttribute("evidence.context_length", evidenceContext.length);
          toolSpan.setAttribute("session.id", sessionId);
        } catch (e) {
          console.error("Evidence gathering failed", e);
          toolSpan.setAttribute("error.message", e instanceof Error ? e.message : "Unknown error");
        }
      }),

      // Image retrieval with tracing
      withToolSpan("image-retrieval", "medical", async (toolSpan) => {
        try {
          if (mode === 'doctor') {
            // DISABLED: Doctor Mode no longer displays images per user request
            // Images were often irrelevant and distracted from the clinical answer
            medicalImages = [];
            console.log('📷 Doctor Mode images disabled - returning empty array');
          } else {
            const images = await retrieveGeneralModeImages(message, healthTopic);
            medicalImages = formatGeneralModeImages(images);
          }

          toolSpan.setAttribute("images.count", medicalImages.length);
          // Log full image URLs for visibility in trace
          toolSpan.setAttribute("chat.images", JSON.stringify(medicalImages.map(img => img.url)));
          toolSpan.setAttribute("images.mode", mode);
          toolSpan.setAttribute("images.health_topic", healthTopic);
          toolSpan.setAttribute("session.id", sessionId);
        } catch (e) {
          console.error("Image retrieval failed", e);
          toolSpan.setAttribute("error.message", e instanceof Error ? e.message : "Unknown error");
          
          // CRITICAL FIX: Set empty array instead of undefined to prevent frontend issues
          medicalImages = [];
          
          // Log detailed error for debugging
          console.error("Detailed image retrieval error:", {
            error: e instanceof Error ? e.message : "Unknown error",
            mode,
            query: message.substring(0, 100),
            healthTopic,
            sessionId
          });
        }
      })
    ]);

    // 2. Build Prompt
    const hasFiles = Boolean(files && files.length > 0);
    const hasImages = Boolean(hasFiles && files?.some((f) => f.startsWith("data:image/")));

    // Select system prompt based on mode and Study Mode flag
    let systemPrompt: string;
    if (isStudyMode && mode === "doctor") {
      systemPrompt = getStudyModePrompt();
      span.setAttribute('chat.study_mode', true);
    } else if (mode === "doctor") {
      systemPrompt = getDoctorModePromptSimplified(hasFiles);
    } else {
      systemPrompt = getGeneralModePrompt();
    }

    // 3. Prepare OpenAI Messages
    const openaiMessages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> }> = [
      { role: "system", content: systemPrompt }
    ];

    if (evidenceContext) {
      openaiMessages.push({
        role: "system",
        content: `\n\n--- EVIDENCE FROM MEDICAL DATABASES ---\n${evidenceContext}\n--- END EVIDENCE ---\n`
      });
    }

    // Add History
    const history = messages.slice(0, -1);
    history.forEach((msg) => {
      openaiMessages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
    });

    // Add Current User Message
    const currentMessageContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
      { type: "text", text: message }
    ];
    if (hasImages && files) {
      files.filter((f) => f.startsWith("data:image/")).forEach((fileData) => {
        currentMessageContent.push({
          type: "image_url",
          image_url: { url: fileData, detail: "high" }
        });
      });
    }
    openaiMessages.push({ role: "user", content: currentMessageContent });

    // 4. Select Model
    const modelName = mode === 'doctor' ? OPENAI_MODELS.DOCTOR : OPENAI_MODELS.GENERAL;
    const finalModel = hasImages ? OPENAI_MODELS.VISION : modelName;

    console.log(`🚀 Requesting OpenAI (${finalModel}) with session: ${sessionId}...`);

    // 5. Call OpenAI & Stream
    // Wrap in LLM span for correct Cost attribution in Phoenix
    const llmSpanResult = await withLLMSpan(
      finalModel,
      message, // User's question for Input column display
      sessionId,
      async () => {
        return await openai.chat.completions.create({
          model: finalModel,
          // @ts-expect-error - OpenAI types are complex with mixed content
          messages: openaiMessages,
          temperature: 0.2,
          max_tokens: 4000,
          stream: true,
          stream_options: { include_usage: true },
        });
      },
      { manualLifecycle: true }
    ) as StreamingSpanResult<any>; // Cast to StreamingSpanResult

    const completion = llmSpanResult.result;
    const llmSpan = llmSpanResult.span;
    console.log(`🚀 Requesting OpenAI (${finalModel}) with session: ${sessionId}...`);

    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send Metadata Chunk first (Medical Images)
          if (medicalImages.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ medicalImages, sessionId, model: finalModel })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sessionId, model: finalModel })}\n\n`));
          }

          // Send content chunks and capture for tracing
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }

            // Capture token usage when available (usually in last chunk)
            if (chunk.usage) {
              // Capture on LLM Span (Child) for correct Cost attribution
              captureTokenUsage(llmSpan, chunk.usage, finalModel);
            }
          }

          // CRITICAL: Capture the complete response and end span when stream completes
          if (fullResponse) {
            console.log(`🎯 Stream completed - capturing output: ${fullResponse.length} characters`);

            // Capture on Root Span
            span.setAttribute("output.value", fullResponse);
            span.setAttribute("output.mime_type", "text/plain");

            // Capture on LLM Span (for Cost/Token bubbling)
            if (llmSpanResult && llmSpanResult.captureOutputAndEnd) {
              llmSpanResult.captureOutputAndEnd(fullResponse);
            }

            // ASYNC: Run Hallucination Check & Record Feedback
            // Use top-level imports to ensure execution
            (async () => {
              console.log("🐛 debug: Async IIFE started");
              try {
                if (ragEvidence) {
                  console.log("🕵️ Starting Hallucination Check...");
                  const report = await generateHallucinationReport(
                    message,
                    fullResponse,
                    ragEvidence as any
                  );

                  console.log(`📋 Hallucination Score: ${report.overallScore}/100 - ${report.summary}`);

                  const normalizedScore = report.overallScore / 100;

                  // Attach feedback to LLM Span so it appears on the Cost row
                  if (llmSpan && llmSpan.spanContext) {
                    await recordFeedback(
                      llmSpan.spanContext().traceId,
                      llmSpan.spanContext().spanId,
                      normalizedScore,
                      "Hallucination",
                      report.summary
                    );
                  }
                }
              } catch (evalError) {
                console.error("❌ Hallucination check failed:", evalError);
              }
            })();
          }

          // End span after capturing output
          span.setStatus({ code: 0 }); // SpanStatusCode.OK = 0
          span.end();
          console.log(`🔚 Span ended with output captured`);

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
        "X-Session-ID": sessionId
      },
    });

  } catch (error) {
    console.error("❌ OpenAI API Error:", error);
    span.setStatus({ code: 1, message: error instanceof Error ? error.message : "API Error" });
    span.end();
    return NextResponse.json({ error: "Failed to generate response", details: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
