# BGE Reranker Configuration & Technical Manual

**Role:** Technical Documentation Lead
**Component:** `lib/evidence/bge-reranker.ts`
**Model:** `Xenova/bge-reranker-base` (ONNX Quantized)

---

## 1. System Overview

The **BGE (BAAI General Embedding) Reranker** is the final and most critical stage of the retrieval pipeline. Unlike the Semantic Reranker (which uses cosine similarity of embeddings), the BGE Reranker is a **Cross-Encoder**. It processes the query and document *together* in a single pass, allowing the attention mechanism to capture deep semantic relationships, nuances, and specific medical terminology matches that bi-encoders miss.

### Core Technology
- **Engine:** `@xenova/transformers` (Runs locally via ONNX Runtime)
- **Primary Model:** `Xenova/bge-reranker-base`
- **Fallback:** Lexical Similarity (Jaccard + Medical Term Boosts)

---

## 2. Configuration Parameters

The reranker is strictly configured via environment variables to ensure clinical precision.

| Parameter | Env Variable | Default | Description |
|-----------|--------------|---------|-------------|
| **Min Score** | `BGE_RERANK_MIN_SCORE` | **0.8** | **Critical Threshold**: Evidence below this confidence score is discarded. Raised from 0.5 to 0.8 for clinical precision. |
| **Max Results** | `BGE_RERANK_MAX_RESULTS` | **10** | **Selectivity**: Hard limit on the number of results to prevent context flooding. |
| **Max Length** | `BGE_RERANK_MAX_LENGTH` | `512` | Token limit for the input sequence (Query + Document). |
| **Min Separation** | `BGE_RERANK_MIN_SEPARATION` | `0.05` | Threshold for applying lexical tie-breaker if scores are too close. |
| **Tie-Breaker** | `BGE_RERANK_TIE_BREAKER_WEIGHT` | `0.15` | Weight given to lexical features when separation is low. |

---

## 3. Reranking Logic & Pipeline

### Phase 1: Input Processing
1.  **Validation**: Comprehensive type checking and sanitization of titles and abstracts.
2.  **Normalization**: Custom `getArticleText` function ensures titles and abstracts are combined and truncated to `BGE_RERANK_MAX_LENGTH * 4` characters as a safety measure.
3.  **Pair Construction**: Creates `[Query, Document]` pairs. If text is missing, defaults like "medical query" and "medical article" are used to prevent model crashes.

### Phase 2: Inference (Cross-Encoding)
- **Batching**: Processes pairs in batches (default: 8) to optimize memory and performance.
- **Label Extraction**: Specifically extracts the score for `LABEL_1` (relevance). If missing, it calculates `1 - LABEL_0`.
- **Normalization**: Applies a **Sigmoid** function if the model returns raw logits, mapping them to a standard `0-1` probability range.

### Phase 3: Selectivity Enforcement (The "Quality Filter")
This is a custom implementation to ensure high precision:
1.  **Threshold Filtering**: Articles with `score < 0.8` are immediately dropped.
2.  **Count Limiting**: Strictly capped at `BGE_RERANK_MAX_RESULTS` (10).
3.  **Dynamic Range Filtering**:
    - If the top 5 articles have very similar scores (gap < 0.1), the system assumes the model is "indecisive" due to high recall and strictly limits output to the **Top 5** to avoid noise.

### Phase 4: Observability (Arize Phoenix)
Every reranking operation is wrapped in a `bge-reranker` trace span:
- **Attributes Tracked**:
    - `reranker.model`: `Xenova/bge-reranker-base`
    - `reranker.input_count` vs `reranker.output_count`: The filtering funnel.
    - `reranker.score_min`, `reranker.score_max`, `reranker.score_median`: Range analysis.
    - `reranker.score_separation`: Confidence indicator.
    - `reranker.latency_ms`: Execution speed.
    - `reranker.invalid_scores`: Safety tracking.

---

## 4. Fallback Mechanisms

If the ONNX model fails to load or execute:
1.  **Lexical Fallback**: The system automatically switches to a custom `computeLexicalScore` function using Jaccard Similarity.
2.  **Medical Boosts**:
    - **Drug Names**: Specific boost (+0.1) for matches like *apixaban, rivaroxaban, warfarin, atrial fibrillation*.
    - **Comparative Terms**: Boost (+0.05) for terms like *compare, versus, difference, efficacy, safety*.
3.  **Neutral Padding**: If a specific batch fails, it is filled with neutral scores (0.5) to ensure evidence survives but isn't overweighted.

---

## 5. Usage Example

```typescript
import { rerankWithBGE } from '@/lib/evidence/bge-reranker';

const rankedArticles = await rerankWithBGE(
  "safety of organic nitrates in hypertrophic cardiomyopathy",
  articles, 
  {
    minScore: 0.8,
    topK: 50
  }
);
```
