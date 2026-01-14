# Comprehensive Reranking System - Current Implementation

## Overview

The reranking system processes **ALL 57+ evidence sources**, not just PubMed and Cochrane. Every piece of evidence is ranked by relevance before being sent to the LLM. The system now uses the BGE Cross-Encoder for primary ranking, with a lexical tie-breaker (Jaccard + medical boosts) only when score separation is too low or the model fails to load.

## Current Implementation: BGE Cross-Encoder + Lexical Tie-Breaker

### BGE Cross-Encoder (Primary)

The primary implementation uses a cross-encoder that evaluates query + document pairs:

1. **Cross-Encoder Scoring**: Attends to query and document together for relevance
2. **Score Normalization**: Scores are normalized to a 0-1 range
3. **Score Separation Logging**: Min/median/max + separation are logged for visibility

### Lexical Tie-Breaker (Fallback)

The fallback uses a lightweight text similarity approach:

1. **Jaccard Similarity**: Calculates intersection over union of query and document word sets
2. **Drug Name Boosting**: +0.1 score for exact matches of medical terms (apixaban, rivaroxaban, atrial fibrillation, chronic kidney disease)
3. **Comparative Language Boosting**: +0.05 score for comparative terms (compare, versus, vs, difference, efficacy, safety, bleeding)
4. **Score Normalization**: Final scores capped at 1.0 for consistency

### Score Distribution
- **Visibility**: Logs min/median/max + separation per rerank run
- **Quality Filtering**: Articles below minimum threshold are filtered out
- **Fallback Safety**: Lexical tie-breaker prevents score saturation

## BGE Cross-Encoder Details

The system uses BGE Cross-Encoder models:
- **Model**: BAAI/bge-reranker-v2-m3 via @xenova/transformers
- **Approach**: Cross-Encoder (query + document together)
- **Infrastructure**: Phoenix OpenTelemetry integration is active

### ✅ **Primary Literature Sources**
1. **PubMed Articles** - Medical research papers
2. **PubMed Reviews** - Review articles and meta-analyses
3. **Cochrane Reviews** - Gold standard systematic reviews
4. **Cochrane Recent** - Latest Cochrane publications
5. **Europe PMC Recent** - Recent European publications
6. **Europe PMC Cited** - Highly cited European papers
7. **Europe PMC Open Access** - Free full-text articles
8. **OpenAlex Literature** - Academic literature database
9. **OpenAlex Systematic Reviews** - Systematic reviews from OpenAlex
10. **Semantic Scholar Papers** - AI-powered academic search
11. **Semantic Scholar Highly Cited** - High-impact papers
12. **PMC Articles** - PubMed Central full-text articles
13. **PMC Reviews** - PubMed Central review articles

### ✅ **Clinical & Drug Information**
14. **Clinical Trials** - ClinicalTrials.gov studies
15. **DailyMed Drugs** - FDA-approved drug labeling
16. **AAP Guidelines** - American Academy of Pediatrics guidelines

### ✅ **Fallback Sources** (When Primary Evidence Insufficient)
17. **Tavily Citations** - Real-time search from trusted medical websites

### ❌ **Sources NOT Reranked** (Static/Reference)
- Drug Labels (OpenFDA) - Static regulatory information
- Adverse Events (FAERS) - Safety data
- MedlinePlus - Consumer health information
- RxNorm - Drug terminology
- WHO/CDC/NICE Guidelines - Pre-curated authoritative sources
- NCBI Books - Textbook content
- OMIM - Genetic database
- PubChem - Chemical database
- Open-i Articles - Fallback biomedical literature (already filtered by relevance)

## How Content is Prepared for Reranking

### Input Format for BGE Cross-Encoder

**Query**: User's clinical question
```
Example: "sepsis vasopressor management guidelines"
```

**Document**: Title + Abstract/Summary (NOT URLs)
```
Example: "Surviving Sepsis Campaign 2021 Guidelines. This study provides comprehensive recommendations for vasopressor selection in septic shock including norepinephrine as first-line therapy, vasopressin as adjunct therapy..."
```

### Content Adaptation by Source

**PubMed/Cochrane**: `title + abstract`
**Europe PMC**: `title + abstractText`
**OpenAlex**: `title + abstract/summary`
**Semantic Scholar**: `title + abstract/summary`
**PMC**: `title + abstract/summary`
**Clinical Trials**: `title + briefSummary + detailedDescription`
**DailyMed**: `title + indications + contraindications + dosage`
**AAP Guidelines**: `title + summary/abstract`
**Tavily Citations**: `title + content` (content limited to 500 chars by Tavily API)

## Reranking Configuration by Source

```typescript
// High-priority sources (more articles, higher thresholds)
PubMed Articles: topK=50, minScore=0.2
PubMed Reviews: topK=20, minScore=0.2
Cochrane Reviews: topK=10, minScore=0.2

// Medium-priority sources
Europe PMC Recent: topK=15, minScore=0.2
OpenAlex Literature: topK=15, minScore=0.2
Semantic Scholar Papers: topK=15, minScore=0.2
PMC Articles: topK=15, minScore=0.2

// Specialized sources (lower thresholds)
Clinical Trials: topK=10, minScore=0.16 (80% of default)
DailyMed Drugs: topK=5, minScore=0.14 (70% of default)
AAP Guidelines: topK=5, minScore=0.16 (80% of default)

// Fallback sources (most permissive)
Tavily Citations: topK=10, minScore=0.12 (60% of default)
```

## Tavily Integration - Real-Time Medical Search

### How Tavily Works
- **Trigger**: Only called when primary evidence is insufficient (< 5 total sources or < 2 high-quality sources)
- **Search Scope**: 30+ trusted medical domains (CDC, WHO, Mayo Clinic, PubMed, etc.)
- **Content**: Returns URLs + title + 500-character content snippets
- **Reranking**: Citations reranked by BGE Cross-Encoder using title + content snippet
- **Threshold**: Lower minScore (60% of default) since content is limited

### Tavily vs Primary Sources
**Primary Sources**: Full abstracts (200-500 words) → Better reranking accuracy
**Tavily**: Content snippets (500 chars max) → Lower reranking accuracy but real-time coverage

### Content Enhancement Opportunity
For highest-quality Tavily reranking, the system could:
1. Fetch full content from Tavily URLs using `webFetch` tool
2. Use full content (not just 500-char snippets) for BGE reranking
3. Apply same reranking thresholds as primary sources

This would require adding a content fetching step after Tavily search but before reranking.

## Integration with Jules.Google Improvements

### ✅ **Trial Misuse Prevention**
- `classifyTrial()` function integrated in evidence engine
- Prevents inappropriate trial citations (e.g., ARISE for vasopressor choice)
- Injects warnings into LLM prompt when trials are misused

### ✅ **Guideline Nuance Extraction**
- `extractRecommendationStrength()` captures "instead of" language
- Preserves stepwise protocols (first-line → second-line → third-line)
- Displays recommendation strengths (Strong/Weak, Class I/IIa/IIb)

### ✅ **Recent Evidence Preservation**
- Recent benchmark sources (last 2 years) bypass strict keyword filtering
- Passed to semantic reranker for smarter evaluation
- Prevents loss of high-impact recent evidence

## Full-Text Integration Pipeline

```
1. User Query → Multiple Database Search
   ↓
2. BGE Reranking (ALL sources by relevance)
   ↓
3. Top Articles Selected (highest BGE scores)
   ↓
4. DOI-Based Full-Text Fetching
   ├─ DOI → Unpaywall API (open access links)
   ├─ PMC ID → NCBI E-Utilities (full-text)
   └─ Fallback → Abstract content
   ↓
5. LLM Context (reranked articles + full-text when available)
   ↓
6. Evidence-Packed Response
```

## Content Sources for Full-Text

**With DOI Links**: PubMed, Cochrane, Europe PMC, OpenAlex, Semantic Scholar
**Without DOI Links**: DailyMed, AAP Guidelines, Clinical Trials, MedlinePlus
**Fallback Strategy**: Use available content (indications, summary, description)

## Environment Configuration

```bash
# Reranking thresholds
BGE_RERANK_MIN_SCORE=0.2        # Default filtering threshold
BGE_RERANK_MAX_LENGTH=512       # Token limit for text processing
BGE_RERANK_MIN_SEPARATION=0.05  # Minimum score separation before tie-breaker
BGE_RERANK_TIE_BREAKER_WEIGHT=0.15 # Lexical tie-breaker blend weight

# Debug mode
BGE_RERANK_DEBUG=true           # Enable score distribution logging
```

## Performance Optimizations

### Batch Processing
- Process articles in batches of 8 for optimal GPU utilization
- Parallel processing across different evidence sources
- Graceful degradation on errors (returns original order)

### Smart Thresholds
- Different minScore values for different source types
- Clinical trials and drug info get lower thresholds (more permissive)
- High-quality sources (Cochrane, PubMed) get standard thresholds

### Caching Integration
- Reranked results cached by query + candidate set hash
- Reduces redundant processing for similar queries
- Phoenix observability for cache hit/miss rates

## Quality Assurance

### Score Validation
- Prevents double-normalization (sigmoid applied only to logits)
- Validates score ranges (0-1) before filtering
- Logs score distributions for debugging

### Content Validation
- Ensures all articles have title + content before reranking
- Filters out articles with invalid URLs or missing content
- Maintains original order as fallback on errors

### Observability
- Phoenix OpenTelemetry integration
- Tracks: input_count, output_count, filtered_count, avg_score, top_score, latency_ms
- Detailed logging for debugging and performance monitoring

## Expected Impact

### Before Comprehensive Reranking
- Only PubMed and Cochrane articles were reranked
- Other sources (Europe PMC, OpenAlex, Clinical Trials, DailyMed, Tavily) used original search order
- Potentially irrelevant articles from non-reranked sources could rank higher than relevant reranked articles

### After Comprehensive Reranking
- ALL 17 evidence source types are reranked by relevance (including Tavily fallback)
- Consistent quality across all evidence sources
- Best articles from ANY source can rise to the top
- Improved LLM context quality leads to better responses
- Real-time Tavily citations properly ranked by relevance

## Files Modified

1. **`lib/evidence/bge-reranker.ts`** - Added reranking functions for all source types
2. **`lib/evidence/engine.ts`** - Integrated comprehensive reranking and updated evidence package
3. **`BGE_RERANKER_CONFIG.md`** - Configuration documentation
4. **`COMPREHENSIVE_RERANKING_SYSTEM.md`** - This complete documentation

The system now ensures that regardless of which database finds the most relevant articles, they will be properly ranked and prioritized for the LLM, resulting in more accurate and comprehensive medical responses.
