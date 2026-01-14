# Observability and Evaluation with Arize Phoenix

To ensure MedGuidance isn’t just “working” but actually selecting high-quality evidence, we integrated **Arize Phoenix** as its central observability layer. This provides deep visibility into the complex retrieval and generation pipeline.

---

## 1. What Phoenix Does in MedGuidance

Every query sent to MedGuidance goes through full OpenTelemetry tracing. This allows us to move from guessing to engineering by seeing:

- **Evidence Funnel**: exactly which sources were hit (PubMed, Cochrane, etc.) and what was returned.
- **Reranking Logic**: how the **BGE Cross‑Encoder** and **MedCPT** scored and filtered documents, turning 50+ results into a high-precision set of 5-10.
- **LLM Observatory**: tracking token usage, model choices, and identifying where the LLM might be over‑ or under‑using certain sources.
- **Quality Control**: spotting failure cases seperti wrong guideline choices, noisy trials, or potential hallucinations and iteratively improving retrieval and prompt strategies.

---

## 2. Technical Implementation Overview

Our implementation leverage OpenTelemetry semantic conventions for AI (OpenInference) to provide a rich visual waterfall in the Phoenix UI.

### The Trace Workflow

1. **Root Span (`withChatSpan`)**: Encapsulates the entire lifecycle of a chat request. It is a `CHAIN` span representing the user's intent.
2. **Orchestration Spans (`withToolSpan`)**:
    - **`evidence-engine`**: Tracks the gathering and formatting of clinical data.
    - **`image-retrieval`**: Tracks multimedia context extraction.
3. **Internal Processing Spans**:
    - **`RETRIEVER` spans**: Log raw documents before filtering.
    - **`RERANKER` spans**: Visualize the "before and after" of our BGE models, logging input vs. output counts and scores.
4. **LLM Span (`withLLMSpan`)**: Specifically tracks the OpenAI/Gemini call, capturing prompt/completion tokens and cost.

### Hallucination Monitoring

MedGuidance includes an automated feedback loop. After a response is generated:

- A `generateHallucinationReport` is triggered asynchronously.
- The results are sent back to Phoenix via `recordFeedback` as **Span Annotations**.
- This allows clinicians and developers to filter for "hallucinated" vs "clean" responses in the dashboard.

---

## 3. The LLM Observatory

The Phoenix dashboard (`http://localhost:6006`) acts as our **LLM Observatory**:

- **Token Tracking**: Standardized token counts (prompt, completion, total) for financial monitoring.
- **Latency Analysis**: Identifying bottlenecks in the ONNX reranking models or API retrievals.
- **Output Inspection**: Reviewing the full medical context (abstracts, guidelines) provided to the LLM to verify grounding.
- **Trace Management**: Using `session.id` to group all messages in a conversation for patient-level audit logs.

---

## 4. Why This Matters

Without this layer, MedGuidance would be a "black box" where failures are hard to diagnose. With Phoenix, we convert clinical inaccuracies into data-backed engineering fixes—adjusting BGE thresholds, refining MeSH mapping, or tuning system prompts based on observed behavior.

---

## 5. Standard Tools & Traces

| Function | Phoenix Span Kind | Purpose |
|----------|-------------------|---------|
| `withChatSpan` | `CHAIN` | The main user interaction |
| `withToolSpan` | `TOOL` | External API calls (PubMed, Tavily) |
| `withRetrieverSpan` | `RETRIEVER` | Data retrieval steps |
| `withRerankerSpan` | `RERANKER` | BGE/Semantic scoring |
| `withLLMSpan` | `LLM` | The final generation & token tracking |
