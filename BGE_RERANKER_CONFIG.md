# BGE Cross-Encoder Reranker Configuration

## Current Implementation

The system now uses the BGE Cross-Encoder (`Xenova/bge-reranker-v2-m3`) for primary reranking. A lightweight lexical tie-breaker (Jaccard + medical boosts) is applied only if score separation is too low or the model fails to load.

## Environment Variables

### `BGE_RERANK_MIN_SCORE` (default: 0.2)
Minimum relevance score threshold for filtering articles after reranking.
- **0.0**: Keep all articles (no filtering)
- **0.2**: Moderate filtering (recommended default)
- **0.3**: Aggressive filtering (high precision)

### `BGE_RERANK_MAX_LENGTH` (default: 512)
Maximum token length for text truncation in the reranker.
- **256**: Fast inference, shorter context
- **512**: Balanced performance (recommended)
- **1024**: Slower but more context

### `BGE_RERANK_MIN_SEPARATION` (default: 0.05)
Minimum score separation required to consider BGE scores well-separated.
- **0.05**: Recommended default
- **0.02**: More permissive separation
- **0.10**: Require stronger separation

### `BGE_RERANK_TIE_BREAKER_WEIGHT` (default: 0.15)
Weight for lexical tie-breaker blending when score separation is low.
- **0.0**: Disable lexical blending (BGE-only)
- **0.15**: Mild lexical boost (recommended)
- **0.30**: Stronger lexical influence

## Current Algorithm Details

### BGE Cross-Encoder (Primary)
- Uses attention over query + document pairs
- Produces normalized relevance scores (0-1)
- Logs score ranges and separation for observability

### Lexical Tie-Breaker (Fallback)
- Jaccard similarity + medical domain boosts
- Applied only when BGE score separation is below `BGE_RERANK_MIN_SEPARATION`

## Usage Examples

```bash
# Conservative filtering with longer context
BGE_RERANK_MIN_SCORE=0.15 BGE_RERANK_MAX_LENGTH=1024 npm run dev

# Aggressive filtering with fast inference
BGE_RERANK_MIN_SCORE=0.3 BGE_RERANK_MAX_LENGTH=256 npm run dev

# Debug mode (logs score distributions)
BGE_RERANK_MIN_SCORE=0.2 BGE_RERANK_MIN_SEPARATION=0.05 npm run dev
```

## Notes

The lexical tie-breaker is designed to preserve BGE ordering while ensuring visible score separation when the model outputs a tight cluster.

## Debugging

To enable score distribution logging, set `debugScores: true` in reranker options:

```typescript
await rerankPubMedWithBGE(query, articles, {
  topK: 50,
  minScore: 0.2,
  debugScores: true // Logs input pairs and raw score distribution
});
```

Or set `BGE_RERANK_DEBUG=true` to enable debug logging globally.

## Performance Impact

- **minScore=0.0**: No filtering, maximum recall
- **minScore=0.2**: ~20-30% filtering, balanced precision/recall  
- **minScore=0.3**: ~40-50% filtering, high precision

Higher minScore values reduce downstream LLM context size and improve response quality.

## Reranking Modes

### Primary: BGE Cross-Encoder
- **Algorithm**: BAAI/bge-reranker-v2-m3 attention mechanism
- **Speed**: Slower (~10-50ms per batch)
- **Accuracy**: Superior semantic understanding
- **Scores**: Logged with min/median/max + separation

### Fallback: Lexical Tie-Breaker
- **Algorithm**: Jaccard similarity + medical domain boosting
- **Speed**: Very fast (~1-2ms per article)
- **Accuracy**: Keyword-based relevance
- **Usage**: Only when BGE fails or scores cluster too tightly
