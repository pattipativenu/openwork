# OPEN WORK: COMPLETE SYSTEM ARCHITECTURE & IMPLEMENTATION GUIDE

**Evidence-First Medical Research Synthesis Platform**

---

## EXECUTIVE SUMMARY

**Project**: Open Work  
**Competition**: Google Gemini API Developer Competition (Gemini 3.0)  
**Category**: Multi-Agent AI System for Medical Evidence Synthesis  
**Core Mission**: Eliminate hallucination in medical literature retrieval through intelligent multi-agent orchestration, advanced re-ranking, and comprehensive observability  

**What We're Building**: A research tool for healthcare professionals that retrieves, validates, ranks, and synthesizes peer-reviewed medical evidence. **NOT** a diagnostic tool, **NOT** a treatment recommendation engine, **NOT** clinical decision support.

---

## 1. PROJECT IDENTITY

### What Open Work IS

- **Evidence-first research platform** for physicians, clinical researchers, and medical students
- **Multi-source retrieval system** combining PubMed, Clinical Trials, DailyMed, Indian Guidelines, and intelligent web search
- **Zero-hallucination commitment** through grounding validation, citation verification, and observability
- **Transparency platform** with full traceability from query → retrieval → re-ranking → synthesis

### What Open Work IS NOT

- ❌ Diagnostic tool for patient conditions
- ❌ Treatment prescribing assistant
- ❌ Clinical decision support replacing physician judgment
- ❌ Patient-facing medical advice platform

### Target Users

1. **Practicing Physicians (70%)** - Evidence reviews, treatment comparisons, drug validation
2. **Clinical Researchers (20%)** - Literature reviews, research gap identification
3. **Medical Trainees (10%)** - Evidence-based learning, case preparation

---

## 2. COMPLETE TECHNOLOGY STACK

### Language Models (Gemini 3.0 Family - Hackathon Compliant)

```yaml
PRIMARY MODEL: Gemini 3.0 Flash
- Model ID: "gemini-3.0-flash-thinking-exp-01-21"
- Use Cases: Query intelligence (Agent 1), Verification gate (Agent 7)
- Thinking Mode: Enabled for complex reasoning
- Context: 1M tokens
- Cost: ~90% of LLM requests
- Speed: 1-2 seconds per call

SECONDARY MODEL: Gemini 3.0 Pro  
- Model ID: "gemini-3.0-pro-exp-02-05"
- Use Cases: Evidence gap analysis (Agent 5), Synthesis (Agent 6)
- Thinking Mode: High-level reasoning for conflicting evidence
- Context: 2M tokens
- Cost: ~10% of LLM requests (only complex queries)
- Speed: 3-5 seconds per call

EMBEDDING MODEL: Gemini text-embedding-004
- Dimension: 768
- Use: Indian guideline vector search in Firestore
```

### Data Sources & APIs

```yaml
NCBI E-utilities (PubMed):
  - Base URL: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
  - Tools: ESearch (PMID lookup), ESummary (metadata), ELink (PMC check), EFetch (full-text)
  - Rate Limit: 10 req/sec with API key
  - Coverage: 36M+ biomedical citations

PubMed Central (PMC):
  - Access: JATS XML via EFetch
  - Coverage: 6M+ full-text open-access articles
  - Format: Structured sections (intro, methods, results, discussion)

ClinicalTrials.gov API v2:
  - Endpoint: https://clinicaltrials.gov/api/v2/studies
  - Coverage: 450K+ clinical trials
  - Data: NCT IDs, outcomes, enrollment, results

DailyMed API:
  - Endpoint: https://dailymed.nlm.nih.gov/dailymed/services/v2/
  - Format: SPL (Structured Product Labels) XML
  - Coverage: FDA-approved drug information

Unpaywall API:
  - Endpoint: https://api.unpaywall.org/v2/{DOI}
  - Use: Open-access PDF discovery
  - Free tier: 100K requests/day

Tavily Search API:
  - Use: Recent/non-indexed content fallback
  - Trigger: Only when evidence gap detected
  - Rate Limit: 1000 req/month (free tier)
```

### Re-Ranking Infrastructure

```yaml
BGE Re-Ranker v2-m3:
  - Source: HuggingFace (BAAI/bge-reranker-v2-m3)
  - Architecture: Cross-encoder transformer
  - Framework: PyTorch + Transformers
  - Max Input: 512 tokens per query-document pair
  - Output: Relevance score (normalized to 0-1)
  - Deployment: Self-hosted CPU (32 batch) or GPU (128 batch)
  - Advantages:
    * Joint encoding of query + document (better than bi-encoders)
    * Multilingual (100+ languages)
    * SOTA on BEIR benchmark
```

### Database & Storage

```yaml
Google Firestore (Vector Store):
  - Use: Indian clinical practice guidelines
  - Extension: Vertex AI Vector Search integration
  - Embeddings: Gemini text-embedding-004 (768-dim)
  - Index: Approximate nearest neighbor (ANN)
  - Collections:
    * guidelines (full documents)
    * guideline_chunks (chunked with embeddings)
    * metadata (source, specialty, year, organization)

Google Cloud Storage:
  - Use: Cache for PMC full-text XML
  - TTL: 30 days
  - Naming: gs://open-work-pmc-cache/{PMCID}.xml
```

### Observability Stack

```yaml
Arize AI Platform:
  - LLM Tracing: Request/response logging for all 7 agents
  - Hallucination Detection: Grounding score computation
  - Cost Tracking: Token usage per query, cumulative
  - Performance: Latency per agent, end-to-end
  - Evaluations: Automated hallucination detection, relevance scoring

Google Cloud Logging:
  - Agent execution logs
  - API call failures
  - Retry attempts
  - Error traces

Custom LLM Observatory:
  - Framework: Streamlit dashboard
  - Metrics: Real-time grounding scores, retrieval precision, cost
  - Alerts: Hallucination rate >5%, latency >15s, cost spike
```

### Orchestration

```yaml
LangGraph (Multi-Agent Framework):
  - State Management: Typed state with validation
  - Conditional Routing: Based on query type, evidence quality
  - Parallel Execution: Retrieval from 5 sources simultaneously  
  - Checkpointing: Resume on failures
  - Human-in-loop: Optional review gate (future)

Async/Await (Python):
  - Library: asyncio, aiohttp
  - Use: Parallel API calls to NCBI, PMC, DailyMed
  - Concurrency: Up to 10 parallel requests
```

### Development & Deployment

```yaml
Language: Python 3.11+
Web Framework: FastAPI (async endpoints)
Frontend: Streamlit (prototype) / React (production)
Deployment: Google Cloud Run (serverless containers)
CI/CD: GitHub Actions
Monitoring: Google Cloud Monitoring + Arize
```

---

## 3. SEVEN-AGENT ARCHITECTURE (DETAILED)

### Overview of Agent Roles

```
Agent 1: Query Intelligence (LLM - Gemini 3 Flash)
  ↓
Agent 2: Multi-Source Retrieval Coordinator (Python Orchestrator)
  ├─ Sub-Agent 2.1: Guidelines Retriever
  ├─ Sub-Agent 2.2: PubMed Intelligence  
  ├─ Sub-Agent 2.3: Full-Text Fetcher (conditional)
  ├─ Sub-Agent 2.4: DailyMed Retriever (conditional)
  └─ Sub-Agent 2.5: Tavily Smart Search (conditional)
  ↓
Agent 3: Evidence Normalizer (Python Transformer)
  ↓
Agent 4: Two-Stage Reranker (BGE + Python)
  ↓
Agent 5: Evidence Gap Analyzer (LLM - Gemini 3 Pro)
  ↓
Agent 6: Synthesis Engine (LLM - Gemini 3 Pro)
  ↓
Agent 7: Verification Gate (LLM - Gemini 3 Flash)
```

---

### AGENT 1: Query Intelligence (LLM)

**Purpose**: Transform raw user query into structured search strategy with multiple variants for comprehensive retrieval.

**Model**: Gemini 3.0 Flash Thinking  
**Input**: Raw user query  
**Output**: Analyzed query with search variants and source requirements

**Example Input**:

```
"What is the first-line treatment for T2DM according to Indian guidelines?"
```

**Example Output**:

```json
{
  "intent": "treatment_guideline",
  "entities": {
    "diseases": ["Type 2 Diabetes Mellitus", "T2DM"],
    "drugs": [],
    "procedures": []
  },
  "abbreviations_expanded": {
    "T2DM": "Type 2 Diabetes Mellitus"
  },
  "search_variants": [
    "Type 2 Diabetes Mellitus first-line treatment India ICMR guidelines",
    "T2DM initial therapy Indian guidelines metformin",
    "Diabetes management protocol India pharmacological intervention",
    "Type 2 diabetes treatment algorithm India primary care"
  ],
  "requires_sources": {
    "guidelines": true,
    "pubmed": true,
    "dailymed": false,
    "recent_web": false
  },
  "temporal_markers": [],
  "complexity_score": 0.4
}
```

**Implementation**:

```python
import google.generativeai as genai
from typing import Dict, List
import json

class QueryIntelligenceAgent:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-3.0-flash-thinking-exp-01-21')
        
    async def analyze_query(self, query: str, trace_id: str) -> Dict:
        """
        Analyze query and generate search strategy
        """
        
        system_prompt = """You are a medical query analyzer for a research platform.
        
Your task: Transform the user's query into a structured search strategy.

Output ONLY valid JSON with this exact structure:
{
  "intent": "treatment_guideline|comparative_analysis|mechanism|dosing|adverse_events|diagnostic_criteria",
  "entities": {
    "diseases": ["full disease names"],
    "drugs": ["drug names with brand/generic"],
    "procedures": ["procedure names"]
  },
  "abbreviations_expanded": {"abbr": "full form"},
  "search_variants": [
    "variant 1 with synonyms",
    "variant 2 with different phrasing",
    "variant 3 with technical terms",
    "variant 4 with common terms"
  ],
  "requires_sources": {
    "guidelines": true/false,
    "pubmed": true/false,
    "dailymed": true/false,
    "recent_web": true/false
  },
  "temporal_markers": ["2024", "recent", "latest"] or [],
  "complexity_score": 0.0-1.0
}

Rules:
1. Generate 3-5 search variants with different phrasings/synonyms
2. Expand ALL medical abbreviations
3. Set guidelines=true if query mentions "guidelines" or specific countries/organizations
4. Set dailymed=true ONLY if asking about specific drug dosing/safety
5. Set recent_web=true ONLY if temporal markers present
6. complexity_score: 0-0.5 (simple), 0.5-0.8 (moderate), 0.8-1.0 (complex multi-domain)
"""
        
        prompt = f"{system_prompt}\n\nUser Query: {query}\n\nOutput JSON:"
        
        # Call Gemini with thinking mode
        response = self.model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.3,
                response_mime_type="application/json"
            )
        )
        
        # Parse JSON response
        analysis = json.loads(response.text)
        
        # Log to Arize
        arize_log_agent(
            agent_name="query_intelligence",
            trace_id=trace_id,
            input={"query": query},
            output=analysis,
            model="gemini-3.0-flash-thinking",
            latency_ms=response.usage_metadata.candidates_token_count  # Approximate
        )
        
        return analysis
```

**Why This Approach**:

- **Search variant generation** dramatically improves recall - we won't miss relevant papers due to phrasing differences
- **Entity extraction** enables targeted MeSH term mapping in PubMed
- **Source routing** prevents unnecessary API calls (e.g., no DailyMed for guideline queries)
- **Complexity scoring** determines whether to use Pro for synthesis

**Cost**: ~500 input tokens + ~800 output tokens = ~$0.001 per query

---

### AGENT 2: Multi-Source Retrieval Coordinator (Python Orchestrator)

**Purpose**: Execute parallel retrieval from all required sources using search variants.

**Type**: Pure Python async orchestration (NO LLM)  
**Input**: Search strategy from Agent 1  
**Output**: Raw results from all sources (100-120 candidates)

**Sub-Agents**:

#### Sub-Agent 2.1: Guidelines Retriever (Firestore Vector Search)

```python
from google.cloud import firestore
from google.cloud.firestore_v1.vector import Vector
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure

class GuidelinesRetriever:
    def __init__(self):
        self.db = firestore.Client()
        self.collection = self.db.collection('guideline_chunks')
        
    async def search(self, search_variants: List[str], trace_id: str) -> List[Dict]:
        """
        Vector search across all variants, deduplicate results
        """
        
        all_results = []
        seen_chunk_ids = set()
        
        for variant in search_variants:
            # Get embedding for this variant
            embedding = await get_gemini_embedding(variant)
            
            # Vector similarity search
            vector_query = self.collection.find_nearest(
                vector_field="embedding",
                query_vector=Vector(embedding),
                distance_measure=DistanceMeasure.COSINE,
                limit=20
            )
            
            results = vector_query.stream()
            
            for doc in results:
                chunk_data = doc.to_dict()
                chunk_id = chunk_data['chunk_id']
                
                # Deduplicate
                if chunk_id not in seen_chunk_ids:
                    seen_chunk_ids.add(chunk_id)
                    all_results.append({
                        'source': 'indian_guideline',
                        'chunk_id': chunk_id,
                        'guideline_id': chunk_data['guideline_id'],
                        'organization': chunk_data['organization'],
                        'title': chunk_data['title'],
                        'year': chunk_data['year'],
                        'text': chunk_data['text'],
                        'similarity_score': chunk_data.get('_distance', 0)
                    })
        
        # Log to Arize
        arize_log_retrieval(
            source='guidelines',
            trace_id=trace_id,
            num_variants=len(search_variants),
            num_results=len(all_results)
        )
        
        return all_results[:20]  # Return top 20
```

#### Sub-Agent 2.2: PubMed Intelligence

```python
import aiohttp
from typing import List, Dict
from xml.etree import ElementTree as ET

class PubMedIntelligence:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
        self.rate_limit_delay = 0.1  # 10 req/sec
        
    async def search(self, search_variants: List[str], 
                    entities: Dict, trace_id: str) -> List[Dict]:
        """
        Multi-variant PubMed search with MeSH expansion
        """
        
        all_pmids = set()
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            
            for variant in search_variants:
                # Build PubMed query with MeSH terms
                pubmed_query = await self._build_pubmed_query(variant, entities)
                task = self._esearch(session, pubmed_query)
                tasks.append(task)
            
            # Execute all searches in parallel
            results = await asyncio.gather(*tasks)
            
            # Combine and deduplicate PMIDs
            for pmid_list in results:
                all_pmids.update(pmid_list)
        
        # Fetch metadata for all unique PMIDs
        pmids_list = list(all_pmids)[:100]  # Cap at 100
        articles = await self._fetch_metadata(pmids_list)
        
        # Check PMC availability via ELink
        articles = await self._check_pmc_availability(articles)
        
        # Log to Arize
        arize_log_retrieval(
            source='pubmed',
            trace_id=trace_id,
            num_variants=len(search_variants),
            total_pmids_found=len(all_pmids),
            after_dedup=len(pmids_list),
            pmc_available=sum(1 for a in articles if a.get('pmcid'))
        )
        
        return articles
    
    async def _build_pubmed_query(self, variant: str, entities: Dict) -> str:
        """
        Construct PubMed query with MeSH terms and filters
        """
        
        query_parts = []
        
        # Add disease MeSH terms
        for disease in entities.get('diseases', []):
            query_parts.append(f'("{disease}"[MeSH Terms] OR "{disease}"[Title/Abstract])')
        
        # Add drug terms
        for drug in entities.get('drugs', []):
            query_parts.append(f'("{drug}"[MeSH Terms] OR "{drug}"[Title/Abstract])')
        
        # Add variant as free text
        query_parts.append(f'"{variant}"')
        
        # Combine with AND
        base_query = ' AND '.join(query_parts)
        
        # Add publication type filters
        filters = [
            '("Meta-Analysis"[PT] OR "Randomized Controlled Trial"[PT] OR "Systematic Review"[PT] OR "Practice Guideline"[PT])',
            '"2015/01/01"[PDAT] : "3000"[PDAT]',  # Last 10 years
            'english[LA]',
            'hasabstract'
        ]
        
        full_query = f'({base_query}) AND {" AND ".join(filters)}'
        
        return full_query
    
    async def _esearch(self, session: aiohttp.ClientSession, query: str) -> List[str]:
        """
        Execute ESearch to get PMIDs
        """
        
        url = f"{self.base_url}/esearch.fcgi"
        params = {
            'db': 'pubmed',
            'term': query,
            'retmax': 50,  # 50 per variant
            'retmode': 'json',
            'sort': 'relevance',
            'api_key': self.api_key
        }
        
        async with session.get(url, params=params) as response:
            data = await response.json()
            return data.get('esearchresult', {}).get('idlist', [])
    
    async def _fetch_metadata(self, pmids: List[str]) -> List[Dict]:
        """
        Fetch detailed metadata using ESummary
        """
        
        url = f"{self.base_url}/esummary.fcgi"
        params = {
            'db': 'pubmed',
            'id': ','.join(pmids),
            'retmode': 'json',
            'api_key': self.api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                data = await response.json()
                
        articles = []
        for pmid in pmids:
            if pmid in data.get('result', {}):
                article_data = data['result'][pmid]
                
                # Extract authors
                authors = [
                    f"{author['name']}" 
                    for author in article_data.get('authors', [])[:3]
                ]
                
                articles.append({
                    'source': 'pubmed',
                    'pmid': pmid,
                    'title': article_data.get('title', ''),
                    'abstract': article_data.get('abstract', ''),  # May be truncated
                    'authors': authors,
                    'journal': article_data.get('fulljournalname', ''),
                    'pub_date': article_data.get('pubdate', ''),
                    'pub_types': article_data.get('pubtype', []),
                    'doi': article_data.get('elocationid', '').replace('doi: ', ''),
                    'pmcid': None  # Will check in next step
                })
        
        return articles
    
    async def _check_pmc_availability(self, articles: List[Dict]) -> List[Dict]:
        """
        Use ELink to check if full-text available in PMC
        """
        
        pmids = [a['pmid'] for a in articles]
        
        url = f"{self.base_url}/elink.fcgi"
        params = {
            'dbfrom': 'pubmed',
            'db': 'pmc',
            'id': ','.join(pmids),
            'retmode': 'json',
            'api_key': self.api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                data = await response.json()
        
        # Map PMID → PMCID
        pmid_to_pmcid = {}
        for linkset in data.get('linksets', []):
            if 'linksetdbs' in linkset:
                for db in linkset['linksetdbs']:
                    if db['dbto'] == 'pmc':
                        pmid = linkset['ids'][0]
                        pmcid = db['links'][0] if db['links'] else None
                        if pmcid:
                            pmid_to_pmcid[pmid] = f"PMC{pmcid}"
        
        # Update articles with PMCID
        for article in articles:
            article['pmcid'] = pmid_to_pmcid.get(article['pmid'])
            article['full_text_available'] = article['pmcid'] is not None
        
        return articles
```

#### Sub-Agent 2.3: Full-Text Fetcher (Conditional)

**Trigger**: Only called by Agent 4 after document-level re-ranking  
**Purpose**: Fetch full-text for top 20 documents to enable chunk-level re-ranking

```python
class FullTextFetcher:
    def __init__(self, api_key: str):
        self.ncbi_api_key = api_key
        self.unpaywall_email = "your@email.com"
        
    async def fetch_full_text(self, article: Dict) -> Dict:
        """
        Try PMC first, fall back to Unpaywall
        """
        
        # Try PMC if PMCID available
        if article.get('pmcid'):
            full_text = await self._fetch_from_pmc(article['pmcid'])
            if full_text:
                article['full_text_sections'] = full_text
                article['full_text_source'] = 'pmc'
                return article
        
        # Try Unpaywall if DOI available
        if article.get('doi'):
            pdf_url = await self._check_unpaywall(article['doi'])
            if pdf_url:
                # Note: Parsing PDF is complex, may skip for hackathon
                article['pdf_url'] = pdf_url
                article['full_text_source'] = 'unpaywall'
        
        # Fall back to abstract only
        article['full_text_source'] = 'abstract_only'
        return article
    
    async def _fetch_from_pmc(self, pmcid: str) -> Dict[str, str]:
        """
        Fetch JATS XML from PMC and parse sections
        """
        
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
        params = {
            'db': 'pmc',
            'id': pmcid.replace('PMC', ''),
            'retmode': 'xml',
            'api_key': self.ncbi_api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                xml_content = await response.text()
        
        # Parse XML
        root = ET.fromstring(xml_content)
        
        sections = {}
        
        # Extract structured sections
        for sec in root.findall('.//sec'):
            sec_type = sec.get('sec-type', 'other')
            title = sec.find('title')
            
            if title is not None:
                section_name = title.text.lower()
            else:
                section_name = sec_type
            
            # Get all text in section
            text_parts = []
            for p in sec.findall('.//p'):
                text_parts.append(''.join(p.itertext()))
            
            sections[section_name] = '\n\n'.join(text_parts)
        
        return sections
    
    async def _check_unpaywall(self, doi: str) -> str:
        """
        Check Unpaywall for open-access PDF
        """
        
        url = f"https://api.unpaywall.org/v2/{doi}"
        params = {'email': self.unpaywall_email}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('is_oa'):
                            # Get best OA location
                            best_oa = data.get('best_oa_location', {})
                            return best_oa.get('url_for_pdf')
        except:
            pass
        
        return None
```

#### Sub-Agent 2.4: DailyMed Retriever (Conditional)

**Trigger**: Only if `requires_sources.dailymed == true`

```python
class DailyMedRetriever:
    async def search(self, drug_names: List[str], trace_id: str) -> List[Dict]:
        """
        Fetch SPL (Structured Product Labels) for drugs
        """
        
        results = []
        
        for drug in drug_names:
            url = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json"
            params = {
                'drug_name': drug,
                'published_after': '2020-01-01'  # Recent labels only
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        for spl in data.get('data', [])[:2]:  # Max 2 per drug
                            # Fetch full SPL XML
                            spl_content = await self._fetch_spl_xml(spl['setid'])
                            
                            results.append({
                                'source': 'dailymed',
                                'drug_name': drug,
                                'setid': spl['setid'],
                                'title': spl.get('title', ''),
                                'published': spl.get('published', ''),
                                'sections': spl_content
                            })
        
        arize_log_retrieval(
            source='dailymed',
            trace_id=trace_id,
            num_drugs=len(drug_names),
            num_labels=len(results)
        )
        
        return results
    
    async def _fetch_spl_xml(self, setid: str) -> Dict[str, str]:
        """
        Parse SPL XML to extract relevant sections
        """
        
        url = f"https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/{setid}.xml"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                xml_content = await response.text()
        
        root = ET.fromstring(xml_content)
        
        sections = {}
        
        # Extract key sections
        section_mappings = {
            '34067-9': 'indications',  # LOINC code for Indications
            '34068-7': 'dosage',
            '43685-7': 'warnings',
            '34084-4': 'adverse_reactions',
            '34073-7': 'drug_interactions',
            '34090-1': 'clinical_pharmacology'
        }
        
        for code, name in section_mappings.items():
            section = root.find(f'.//*[@code="{code}"]')
            if section is not None:
                sections[name] = ''.join(section.itertext())[:2000]  # Truncate
        
        return sections
```

#### Sub-Agent 2.5: Tavily Smart Search (Conditional)

**Trigger**: Only called by Agent 5 if evidence gap detected

```python
from tavily import TavilyClient

class TavilySmartSearch:
    def __init__(self, api_key: str):
        self.client = TavilyClient(api_key=api_key)
        
    async def search(self, query: str, existing_urls: set, trace_id: str) -> List[Dict]:
        """
        Search recent web content, deduplicate against existing sources
        """
        
        response = self.client.search(
            query=query,
            search_depth="advanced",
            max_results=10,
            include_domains=["nih.gov", "thelancet.com", "nejm.org", "bmj.com", "jamanetwork.com"],
            exclude_domains=["wikipedia.org"]
        )
        
        new_results = []
        
        for result in response.get('results', []):
            url = result['url']
            
            # Deduplicate
            if url not in existing_urls:
                new_results.append({
                    'source': 'tavily_web',
                    'url': url,
                    'title': result['title'],
                    'content': result['content'],
                    'score': result.get('score', 0),
                    'published_date': result.get('published_date')
                })
                existing_urls.add(url)
        
        arize_log_retrieval(
            source='tavily',
            trace_id=trace_id,
            query=query,
            num_results=len(new_results),
            deduped_from=len(response.get('results', []))
        )
        
        return new_results
```

**Coordinator Implementation**:

```python
class MultiSourceRetrievalCoordinator:
    def __init__(self, config: Dict):
        self.guidelines = GuidelinesRetriever()
        self.pubmed = PubMedIntelligence(config['ncbi_api_key'])
        self.full_text = FullTextFetcher(config['ncbi_api_key'])
        self.dailymed = DailyMedRetriever()
        self.tavily = TavilySmartSearch(config['tavily_api_key'])
        
    async def retrieve_all(self, search_strategy: Dict, trace_id: str) -> Dict[str, List]:
        """
        Parallel retrieval from all required sources
        """
        
        tasks = []
        sources = search_strategy['requires_sources']
        
        # Guidelines
        if sources['guidelines']:
            tasks.append(
                self.guidelines.search(
                    search_strategy['search_variants'],
                    trace_id
                )
            )
        else:
            tasks.append(asyncio.sleep(0, result=[]))
        
        # PubMed (always search)
        if sources['pubmed']:
            tasks.append(
                self.pubmed.search(
                    search_strategy['search_variants'],
                    search_strategy['entities'],
                    trace_id
                )
            )
        else:
            tasks.append(asyncio.sleep(0, result=[]))
        
        # DailyMed (conditional)
        if sources['dailymed'] and search_strategy['entities']['drugs']:
            tasks.append(
                self.dailymed.search(
                    search_strategy['entities']['drugs'],
                    trace_id
                )
            )
        else:
            tasks.append(asyncio.sleep(0, result=[]))
        
        # Execute in parallel
        guideline_results, pubmed_results, dailymed_results = await asyncio.gather(*tasks)
        
        return {
            'guidelines': guideline_results,
            'pubmed': pubmed_results,
            'dailymed': dailymed_results,
            'tavily': []  # Will be populated by Agent 5 if needed
        }
```

**Cost**: Mostly $0 (free APIs), ~0.2-0.5 seconds per source  
**Total Latency**: 2-5 seconds (parallel execution)

---

### AGENT 3: Evidence Normalizer (Python Transformer)

**Purpose**: Convert all source formats into unified `EvidenceCandidate` objects.

**Type**: Pure Python transformation (NO LLM)  
**Input**: Raw results from Agent 2  
**Output**: List of `EvidenceCandidate` objects (100-120 total)

```python
from dataclasses import dataclass
from typing import Optional, List

@dataclass
class EvidenceCandidate:
    source: str  # 'pubmed', 'indian_guideline', 'dailymed', 'tavily_web'
    id: str  # PMID, guideline_id, setid, or URL
    title: str
    text: str  # Abstract or chunk text
    metadata: Dict  # Source-specific metadata
    full_text_available: bool = False
    full_text_sections: Optional[Dict] = None

class EvidenceNormalizer:
    def normalize_all(self, raw_results: Dict) -> List[EvidenceCandidate]:
        """
        Convert all formats to EvidenceCandidate
        """
        
        candidates = []
        seen_ids = set()
        
        # Guidelines
        for doc in raw_results['guidelines']:
            candidate = EvidenceCandidate(
                source='indian_guideline',
                id=doc['chunk_id'],
                title=doc['title'],
                text=doc['text'],
                metadata={
                    'organization': doc['organization'],
                    'year': doc['year'],
                    'guideline_id': doc['guideline_id']
                },
                full_text_available=False
            )
            candidates.append(candidate)
            seen_ids.add(candidate.id)
        
        # PubMed
        for doc in raw_results['pubmed']:
            pmid = doc['pmid']
            if pmid in seen_ids:
                continue
            
            candidate = EvidenceCandidate(
                source='pubmed',
                id=pmid,
                title=doc['title'],
                text=doc['abstract'],
                metadata={
                    'authors': doc['authors'],
                    'journal': doc['journal'],
                    'pub_date': doc['pub_date'],
                    'doi': doc.get('doi'),
                    'pmcid': doc.get('pmcid'),
                    'pub_types': doc['pub_types']
                },
                full_text_available=doc.get('full_text_available', False)
            )
            candidates.append(candidate)
            seen_ids.add(pmid)
        
        # DailyMed
        for doc in raw_results['dailymed']:
            setid = doc['setid']
            if setid in seen_ids:
                continue
            
            # Combine relevant sections
            text_parts = []
            for section_name in ['indications', 'dosage', 'clinical_pharmacology']:
                if section_name in doc['sections']:
                    text_parts.append(f"{section_name.upper()}:\n{doc['sections'][section_name]}")
            
            candidate = EvidenceCandidate(
                source='dailymed',
                id=setid,
                title=doc['title'],
                text='\n\n'.join(text_parts),
                metadata={
                    'drug_name': doc['drug_name'],
                    'published': doc['published'],
                    'all_sections': doc['sections']
                },
                full_text_available=True,
                full_text_sections=doc['sections']
            )
            candidates.append(candidate)
            seen_ids.add(setid)
        
        # Tavily (if present)
        for doc in raw_results.get('tavily', []):
            url = doc['url']
            if url in seen_ids:
                continue
            
            candidate = EvidenceCandidate(
                source='tavily_web',
                id=url,
                title=doc['title'],
                text=doc['content'],
                metadata={
                    'url': url,
                    'score': doc['score'],
                    'published_date': doc.get('published_date')
                },
                full_text_available=False
            )
            candidates.append(candidate)
            seen_ids.add(url)
        
        return candidates
```

**Cost**: $0  
**Latency**: <1 second

---

### AGENT 4: Two-Stage Reranker (BGE + Python)

**Purpose**: Narrow down 100-120 candidates to top 10 evidence chunks.

**Type**: ML Model (BGE cross-encoder) + Python orchestration  
**Model**: BAAI/bge-reranker-v2-m3 (HuggingFace)

**Two-Stage Process**:

1. **Stage 1**: Document-level re-ranking (100-120 docs → Top 20)
2. **Stage 2**: Chunk-level re-ranking (20 docs chunked → Top 10 chunks)

```python
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from langchain.text_splitter import RecursiveCharacterTextSplitter

class TwoStageReranker:
    def __init__(self):
        model_name = "BAAI/bge-reranker-v2-m3"
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)
        self.model.eval()
        
        self.chunker = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        
    async def rerank(self, query: str, candidates: List[EvidenceCandidate], 
                    full_text_fetcher, trace_id: str) -> List[Dict]:
        """
        Two-stage re-ranking process
        """
        
        # STAGE 1: Document-level re-ranking
        stage1_start = time.time()
        
        doc_scores = await self._score_documents(query, candidates)
        
        # Sort and take top 20
        top_20_docs = sorted(
            zip(candidates, doc_scores),
            key=lambda x: x[1],
            reverse=True
        )[:20]
        
        stage1_time = time.time() - stage1_start
        
        arize_log_reranking_stage(
            stage=1,
            trace_id=trace_id,
            input_count=len(candidates),
            output_count=20,
            avg_score=sum(doc_scores) / len(doc_scores),
            top_score=doc_scores[0],
            latency_ms=int(stage1_time * 1000)
        )
        
        # STAGE 2: Fetch full-text and chunk-level re-ranking
        stage2_start = time.time()
        
        # Fetch full-text for top 20
        enriched_docs = []
        for candidate, score in top_20_docs:
            if candidate.full_text_available and not candidate.full_text_sections:
                # Fetch full text
                enriched = await full_text_fetcher.fetch_full_text(candidate.__dict__)
                candidate.full_text_sections = enriched.get('full_text_sections')
            enriched_docs.append((candidate, score))
        
        # Chunk all documents
        all_chunks = []
        for candidate, doc_level_score in enriched_docs:
            chunks = self._chunk_document(candidate)
            for chunk in chunks:
                chunk['doc_level_score'] = doc_level_score
                all_chunks.append(chunk)
        
        # Re-rank chunks
        chunk_scores = await self._score_chunks(query, all_chunks)
        
        # Combine chunk scores with doc scores
        final_scores = []
        for chunk, chunk_score in zip(all_chunks, chunk_scores):
            combined_score = 0.6 * chunk_score + 0.4 * chunk['doc_level_score']
            final_scores.append((chunk, combined_score))
        
        # Sort and take top 10
        top_10_chunks = sorted(
            final_scores,
            key=lambda x: x[1],
            reverse=True
        )[:10]
        
        stage2_time = time.time() - stage2_start
        
        arize_log_reranking_stage(
            stage=2,
            trace_id=trace_id,
            input_count=len(all_chunks),
            output_count=10,
            avg_score=sum(chunk_scores) / len(chunk_scores),
            top_score=chunk_scores[0] if chunk_scores else 0,
            latency_ms=int(stage2_time * 1000)
        )
        
        # Format for output
        evidence_pack = []
        for chunk, score in top_10_chunks:
            evidence_pack.append({
                'rank': len(evidence_pack) + 1,
                'score': score,
                'source': chunk['source'],
                'id': chunk['id'],
                'title': chunk['title'],
                'text': chunk['text'],
                'metadata': chunk['metadata'],
                'chunk_info': {
                    'section': chunk.get('section'),
                    'chunk_index': chunk.get('chunk_index')
                }
            })
        
        return evidence_pack
    
    async def _score_documents(self, query: str, candidates: List[EvidenceCandidate]) -> List[float]:
        """
        Stage 1: Score documents using abstracts/snippets
        """
        
        pairs = []
        for candidate in candidates:
            # Format document text
            doc_text = f"Title: {candidate.title}\n\n{candidate.text[:1500]}"  # First 1500 chars
            pairs.append([query, doc_text])
        
        # Batch inference
        scores = await self._batch_inference(pairs)
        return scores
    
    async def _score_chunks(self, query: str, chunks: List[Dict]) -> List[float]:
        """
        Stage 2: Score chunks
        """
        
        pairs = []
        for chunk in chunks:
            doc_text = f"Title: {chunk['title']}\nSource: {chunk['source']}\n\n{chunk['text']}"
            pairs.append([query, doc_text])
        
        scores = await self._batch_inference(pairs)
        return scores
    
    async def _batch_inference(self, pairs: List[List[str]]) -> List[float]:
        """
        Run BGE re-ranker in batches
        """
        
        batch_size = 32 if self.device == "cpu" else 128
        all_scores = []
        
        for i in range(0, len(pairs), batch_size):
            batch = pairs[i:i+batch_size]
            
            # Tokenize
            inputs = self.tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors='pt'
            ).to(self.device)
            
            # Inference
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits.squeeze(-1)
                
                # Normalize to 0-1 using sigmoid
                scores = torch.sigmoid(logits).cpu().tolist()
            
            all_scores.extend(scores)
        
        return all_scores
    
    def _chunk_document(self, candidate: EvidenceCandidate) -> List[Dict]:
        """
        Chunk a document for fine-grained re-ranking
        """
        
        chunks = []
        
        # If full-text available, chunk by section
        if candidate.full_text_sections:
            for section_name, section_text in candidate.full_text_sections.items():
                section_chunks = self.chunker.split_text(section_text)
                
                for i, chunk_text in enumerate(section_chunks):
                    chunks.append({
                        'source': candidate.source,
                        'id': candidate.id,
                        'title': candidate.title,
                        'text': chunk_text,
                        'metadata': candidate.metadata,
                        'section': section_name,
                        'chunk_index': i
                    })
        else:
            # Use abstract/snippet as single chunk
            chunks.append({
                'source': candidate.source,
                'id': candidate.id,
                'title': candidate.title,
                'text': candidate.text,
                'metadata': candidate.metadata,
                'section': 'abstract',
                'chunk_index': 0
            })
        
        return chunks
```

**Cost**: $0 (self-hosted model)  
**Latency**: Stage 1 (2-3s) + Stage 2 (3-4s) = ~5-7 seconds total

---

### AGENT 5: Evidence Gap Analyzer (LLM)

**Purpose**: Assess if retrieved evidence is sufficient to answer query, trigger Tavily if needed.

**Model**: Gemini 2.0 Pro  
**Input**: Query + Top 10 evidence chunks  
**Output**: Sufficiency assessment + optional Tavily trigger

```python
class EvidenceGapAnalyzer:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-pro-exp-02-05')
        
    async def analyze(self, query: str, evidence_pack: List[Dict], 
                     trace_id: str) -> Dict:
        """
        Assess evidence quality and identify gaps
        """
        
        # Format evidence for analysis
        evidence_summary = self._format_evidence(evidence_pack)
        
        system_prompt = """You are an evidence quality analyzer for medical research.

Your task: Assess if the provided evidence is sufficient to answer the user's query.

Analyze for:
1. Coverage: Does evidence address all aspects of the query?
2. Recency: Is evidence up-to-date? (Flag if all sources >3 years old)
3. Quality: Are sources high-quality (RCTs, meta-analyses, guidelines)?
4. Contradictions: Do sources conflict?
5. Gaps: What's missing?

Output JSON:
{
  "assessment": "sufficient|partial|insufficient",
  "coverage_score": 0.0-1.0,
  "recency_concerns": true/false,
  "oldest_source_year": 2020,
  "quality_distribution": {
    "guidelines": 2,
    "rcts": 3,
    "observational": 4,
    "reviews": 1
  },
  "contradictions_detected": true/false,
  "contradiction_summary": "Source A says X, Source B says Y",
  "missing_elements": ["recent clinical trial data", "Indian-specific data"],
  "recommendation": "proceed|search_recent|search_specific_gap"
}

If recency_concerns=true AND query asks about current/recent info:
  recommendation = "search_recent"

If specific gap AND <5 high-quality sources:
  recommendation = "search_specific_gap"

Otherwise:
  recommendation = "proceed"
"""
        
        prompt = f"""{system_prompt}

User Query: {query}

Retrieved Evidence:
{evidence_summary}

Output JSON:"""
        
        response = self.model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json"
            )
        )
        
        analysis = json.loads(response.text)
        
        # Log to Arize
        arize_log_agent(
            agent_name="evidence_gap_analyzer",
            trace_id=trace_id,
            input={"query": query, "num_sources": len(evidence_pack)},
            output=analysis,
            model="gemini-2.0-pro-exp",
            latency_ms=None
        )
        
        return analysis
    
    def _format_evidence(self, evidence_pack: List[Dict]) -> str:
        """
        Summarize evidence for gap analysis
        """
        
        summary_parts = []
        for item in evidence_pack:
            summary_parts.append(f"""
[Source {item['rank']}]
Type: {item['source']}
ID: {item['id']}
Title: {item['title']}
Year: {item['metadata'].get('pub_date', item['metadata'].get('year', 'unknown'))[:4]}
Relevance Score: {item['score']:.2f}
Text Preview: {item['text'][:300]}...
---
""")
        
        return '\n'.join(summary_parts)
```

**Conditional Tavily Trigger**:

```python
async def maybe_search_tavily(analysis: Dict, query: str, evidence_pack: List[Dict],
                             tavily_searcher, trace_id: str) -> List[Dict]:
    """
    Trigger Tavily if gap detected
    """
    
    if analysis['recommendation'] == 'search_recent':
        # Build temporal query
        tavily_query = f"{query} recent 2024 2025 latest"
        
        # Get existing URLs to avoid duplicates
        existing_urls = {
            item['metadata'].get('url', item['id']) 
            for item in evidence_pack
        }
        
        # Search Tavily
        new_results = await tavily_searcher.search(tavily_query, existing_urls, trace_id)
        
        # Append to evidence pack (will be re-ranked if significant)
        return new_results
    
    return []
```

**Cost**: ~2K input tokens + ~500 output tokens = ~$0.003  
**Latency**: 2-3 seconds

---

### AGENT 6: Synthesis Engine (LLM)

**Purpose**: Generate <500 word evidence-based answer with inline citations.

**Model**: Gemini 2.0 Pro (for complex queries) or Flash (for simple)  
**Decision**: Use Pro if `complexity_score > 0.5` OR `contradictions_detected == true`

```python
class SynthesisEngine:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.flash_model = genai.GenerativeModel('gemini-3.0-flash-thinking-exp-01-21')
        self.pro_model = genai.GenerativeModel('gemini-3.0-pro-exp-02-05')
        
    async def synthesize(self, query: str, evidence_pack: List[Dict],
                        gap_analysis: Dict, complexity_score: float,
                        trace_id: str) -> Dict:
        """
        Generate evidence-based answer
        """
        
        # Choose model based on complexity
        if complexity_score > 0.5 or gap_analysis.get('contradictions_detected'):
            model = self.pro_model
            model_name = "gemini-3.0-pro-exp"
        else:
            model = self.flash_model
            model_name = "gemini-3.0-flash-thinking"
        
        # Build evidence context
        evidence_context = self._format_evidence_for_synthesis(evidence_pack)
        
        system_prompt = """You are a medical evidence synthesizer for Open Work research platform.

CRITICAL RULES:
1. ONLY use information from the provided evidence sources
2. EVERY factual claim MUST have inline citation: [N] where N is source rank
3. If sources conflict, state explicitly: "Source [1] reports X, while Source [3] reports Y"
4. If evidence is insufficient, say so clearly
5. NO treatment recommendations - only evidence presentation
6. Structure: Direct answer (2-3 sentences) → Evidence hierarchy → Limitations
7. Maximum 500 words
8. Include publication years for context

Citation Format:
- Inline: "Apixaban showed lower bleeding risk [1]."
- If multiple sources: "Multiple studies confirm this [1][3][5]."
- Conflicting: "While [1] found X, [2] reported Y."

NEVER:
- Generate claims without citations
- Make recommendations ("you should", "it is recommended")
- Diagnose or advise on specific patients
- Extrapolate beyond what sources state
"""
        
        prompt = f"""{system_prompt}

User Query: {query}

Evidence Sources:
{evidence_context}

Gap Analysis Summary:
- Coverage: {gap_analysis['coverage_score']:.0%}
- Contradictions: {'Yes' if gap_analysis['contradictions_detected'] else 'No'}
- Missing: {', '.join(gap_analysis['missing_elements'][:3]) if gap_analysis['missing_elements'] else 'None'}

Generate synthesis (<500 words):"""
        
        synthesis_start = time.time()
        
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                max_output_tokens=1000
            )
        )
        
        synthesis_text = response.text
        synthesis_time = time.time() - synthesis_start
        
        # Extract citations
        citations = self._extract_citations(synthesis_text, evidence_pack)
        
        # Track tokens for cost
        token_count = {
            'input': response.usage_metadata.prompt_token_count,
            'output': response.usage_metadata.candidates_token_count,
            'total': response.usage_metadata.total_token_count
        }
        
        # Calculate cost
        cost = self._calculate_cost(model_name, token_count)
        
        # Log to Arize
        arize_log_agent(
            agent_name="synthesis_engine",
            trace_id=trace_id,
            input={"query": query, "num_sources": len(evidence_pack)},
            output={"synthesis_length": len(synthesis_text), "num_citations": len(citations)},
            model=model_name,
            token_count=token_count,
            cost_usd=cost,
            latency_ms=int(synthesis_time * 1000)
        )
        
        return {
            'synthesis': synthesis_text,
            'citations': citations,
            'evidence_pack': evidence_pack,
            'tokens': token_count,
            'cost': cost,
            'model_used': model_name
        }
    
    def _format_evidence_for_synthesis(self, evidence_pack: List[Dict]) -> str:
        """
        Format evidence sources for synthesis prompt
        """
        
        formatted = []
        for item in evidence_pack:
            source_type = item['source']
            metadata = item['metadata']
            
            # Format based on source type
            if source_type == 'pubmed':
                citation = f"{metadata['authors'][0]} et al. {metadata['journal']} {metadata['pub_date'][:4]}"
                pmid = f"PMID:{item['id']}"
            elif source_type == 'indian_guideline':
                citation = f"{metadata['organization']} {metadata['year']}"
                pmid = f"Guideline:{item['id']}"
            elif source_type == 'dailymed':
                citation = f"FDA Label: {metadata['drug_name']} ({metadata['published'][:4]})"
                pmid = f"SetID:{item['id']}"
            else:
                citation = f"Web: {metadata.get('url', item['id'])}"
                pmid = f"URL:{item['id']}"
            
            formatted.append(f"""
[{item['rank']}] {citation}
{pmid}
Title: {item['title']}
Relevance: {item['score']:.2f}

Content:
{item['text']}

{'Section: ' + item['chunk_info']['section'] if item['chunk_info'].get('section') else ''}
---
""")
        
        return '\n'.join(formatted)
    
    def _extract_citations(self, synthesis_text: str, evidence_pack: List[Dict]) -> List[Dict]:
        """
        Extract citation numbers and map to sources
        """
        
        import re
        
        # Find all [N] patterns
        citation_pattern = r'\[(\d+)\]'
        citation_numbers = set(re.findall(citation_pattern, synthesis_text))
        
        citations = []
        for num_str in citation_numbers:
            num = int(num_str)
            
            # Find corresponding source
            source = next((item for item in evidence_pack if item['rank'] == num), None)
            
            if source:
                citations.append({
                    'number': num,
                    'source': source['source'],
                    'id': source['id'],
                    'title': source['title'],
                    'metadata': source['metadata']
                })
        
        return citations
    
    def _calculate_cost(self, model_name: str, token_count: Dict) -> float:
        """
        Calculate LLM cost based on pricing
        """
        
        pricing = {
            'gemini-3.0-flash-thinking-exp': {
                'input': 0.075 / 1_000_000,
                'output': 0.30 / 1_000_000
            },
            'gemini-3.0-pro-exp': {
                'input': 1.25 / 1_000_000,
                'output': 5.00 / 1_000_000
            }
        }
        
        rate = pricing.get(model_name, pricing['gemini-3.0-flash-thinking-exp'])
        
        cost = (
            token_count['input'] * rate['input'] +
            token_count['output'] * rate['output']
        )
        
        return cost
```

**Cost**:

- Flash: ~3K input + ~800 output = ~$0.001
- Pro: ~3K input + ~800 output = ~$0.007

**Latency**: 3-5 seconds

---

### AGENT 7: Verification Gate (LLM)

**Purpose**: Final validation that synthesis is grounded in evidence.

**Model**: Gemini 2.0 Flash  
**Input**: Synthesis + Evidence pack  
**Output**: Verified synthesis OR rejection with issues

```python
class VerificationGate:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-3.0-flash-thinking-exp-01-21')
        
    async def verify(self, synthesis: Dict, trace_id: str) -> Dict:
        """
        Verify synthesis against evidence
        """
        
        # Extract claims from synthesis
        claims = self._extract_claims(synthesis['synthesis'])
        
        # Check each claim
        validation_results = {
            'total_claims': len(claims),
            'cited_claims': 0,
            'uncited_claims': [],
            'invalid_citations': [],
            'unsupported_claims': [],
            'hallucination_detected': False
        }
        
        # Parse citations from synthesis
        cited_claim_pattern = r'([^.!?]+)\s*\[(\d+(?:,\s*\d+)*)\]'
        import re
        cited_claims = re.findall(cited_claim_pattern, synthesis['synthesis'])
        
        validation_results['cited_claims'] = len(cited_claims)
        
        # Check for uncited claims
        for claim in claims:
            has_citation = any(claim in cited_claim[0] for cited_claim in cited_claims)
            if not has_citation:
                validation_results['uncited_claims'].append(claim)
        
        # Validate citations exist
        cited_numbers = set()
        for _, numbers_str in cited_claims:
            numbers = [int(n.strip()) for n in numbers_str.split(',')]
            cited_numbers.update(numbers)
        
        valid_numbers = set(c['number'] for c in synthesis['citations'])
        invalid = cited_numbers - valid_numbers
        validation_results['invalid_citations'] = list(invalid)
        
        # Grounding check (semantic similarity)
        for claim, numbers_str in cited_claims:
            numbers = [int(n.strip()) for n in numbers_str.split(',')]
            
            # Get cited sources
            cited_sources = [
                source for source in synthesis['evidence_pack']
                if source['rank'] in numbers
            ]
            
            # Check if claim is grounded
            is_grounded = await self._check_grounding(claim, cited_sources)
            
            if not is_grounded:
                validation_results['unsupported_claims'].append({
                    'claim': claim,
                    'citations': numbers
                })
        
        # Determine if validation passed
        validation_results['hallucination_detected'] = (
            len(validation_results['unsupported_claims']) > 0 or
            len(validation_results['uncited_claims']) > 2  # Allow 2 uncited claims for intro/conclusion
        )
        
        validation_results['passed'] = not validation_results['hallucination_detected']
        
        # Calculate grounding score
        if validation_results['total_claims'] > 0:
            grounding_score = 1.0 - (
                len(validation_results['unsupported_claims']) / validation_results['total_claims']
            )
        else:
            grounding_score = 1.0
        
        validation_results['grounding_score'] = grounding_score
        
        # Log to Arize
        arize_log_agent(
            agent_name="verification_gate",
            trace_id=trace_id,
            input={"synthesis_length": len(synthesis['synthesis'])},
            output=validation_results,
            model="gemini-3.0-flash-thinking",
            latency_ms=None
        )
        
        # Add warnings if needed
        if not validation_results['passed']:
            warning = self._generate_warning(validation_results)
            synthesis['warning'] = warning
        
        return synthesis
    
    def _extract_claims(self, text: str) -> List[str]:
        """
        Split text into individual claims (sentences)
        """
        
        import re
        # Split by sentence endings
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        # Filter out very short sentences (likely fragments)
        claims = [s.strip() for s in sentences if len(s.strip()) > 20]
        
        return claims
    
    async def _check_grounding(self, claim: str, cited_sources: List[Dict]) -> bool:
        """
        Check if claim is semantically supported by cited sources
        """
        
        # Combine source texts
        source_texts = [source['text'] for source in cited_sources]
        combined_sources = '\n\n'.join(source_texts)
        
        # Use Gemini for semantic entailment check
        prompt = f"""Is the following claim supported by the provided evidence?

Claim: {claim}

Evidence:
{combined_sources}

Answer ONLY 'YES' or 'NO'. If the claim is a reasonable inference from the evidence, answer YES. If the claim contradicts or goes beyond the evidence, answer NO."""
        
        response = self.model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0)
        )
        
        answer = response.text.strip().upper()
        return answer == 'YES'
    
    def _generate_warning(self, validation_results: Dict) -> str:
        """
        Generate user-facing warning about validation issues
        """
        
        warnings = []
        
        if validation_results['uncited_claims']:
            warnings.append(f"⚠️ {len(validation_results['uncited_claims'])} claims lack citations")
        
        if validation_results['invalid_citations']:
            warnings.append(f"⚠️ Invalid citation numbers: {validation_results['invalid_citations']}")
        
        if validation_results['unsupported_claims']:
            warnings.append(f"⚠️ {len(validation_results['unsupported_claims'])} claims may not be fully supported by evidence")
        
        return ' | '.join(warnings)
```

**Cost**: ~1.5K input + ~300 output = ~$0.0005  
**Latency**: 1-2 seconds

---

## 4. COMPLETE WORKFLOW DIAGRAM (ASCII)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        USER QUERY INPUT                               │
│  "Compare apixaban vs rivaroxaban in AF with CKD (eGFR 30-50)"      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   ARIZE TRACING INITIALIZED                           │
│  trace_id = uuid4() | Start timestamp | Log query                    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│       AGENT 1: QUERY INTELLIGENCE (Gemini 3 Flash Thinking)          │
│                                                                       │
│  Input: Raw query                                                     │
│  Process:                                                             │
│   • Extract entities: {                                               │
│       diseases: ["atrial fibrillation", "chronic kidney disease"],   │
│       drugs: ["apixaban", "rivaroxaban"]                              │
│     }                                                                 │
│   • Expand abbreviations: AF → Atrial Fibrillation                   │
│   • Generate search variants: [                                       │
│       "apixaban rivaroxaban atrial fibrillation chronic kidney disease", │
│       "direct oral anticoagulants CKD eGFR moderate renal impairment",│
│       "NOAC comparison AF renal function 30-50 mL/min"                │
│     ]                                                                 │
│   • Determine sources: {guidelines: true, pubmed: true,               │
│                         dailymed: true, recent_web: false}            │
│   • Complexity: 0.75 (→ will use Pro for synthesis)                  │
│                                                                       │
│  Output: Structured search strategy (JSON)                            │
│  Cost: $0.001 | Latency: 1.5s                                        │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│     AGENT 2: MULTI-SOURCE RETRIEVAL (Python Async Orchestrator)      │
│                                                                       │
│  Parallel Execution (5 async tasks):                                 │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Sub-Agent 2.1: Guidelines Retriever (Firestore Vector)         │ │
│  │  • Embed all 3 search variants with text-embedding-004          │ │
│  │  • Vector search (cosine similarity > 0.75)                     │ │
│  │  • Deduplicate across variants                                  │ │
│  │  → Returns: 18 guideline chunks                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Sub-Agent 2.2: PubMed Intelligence                              │ │
│  │  • Build 3 PubMed queries with MeSH expansion:                  │ │
│  │    - ("apixaban"[MeSH] OR "rivaroxaban"[MeSH]) AND              │ │
│  │      "atrial fibrillation"[MeSH] AND                            │ │
│  │      ("renal insufficiency, chronic"[MeSH]) AND                 │ │
│  │      ("Comparative Study"[PT] OR "RCT"[PT])                     │ │
│  │  • ESearch (3 parallel calls) → 87 unique PMIDs                 │ │
│  │  • ESummary → Fetch abstracts + metadata                        │ │
│  │  • ELink → Check PMC availability (23 have PMCID)               │ │
│  │  → Returns: 87 articles with metadata                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Sub-Agent 2.4: DailyMed Retriever                               │ │
│  │  • Search SPLs for "apixaban" and "rivaroxaban"                 │ │
│  │  • Fetch most recent labels (2024)                              │ │
│  │  • Parse XML → Extract dosing, warnings, pharmacology           │ │
│  │  → Returns: 2 drug labels                                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  (Sub-Agent 2.3: Full-Text Fetcher - NOT called yet)                 │
│  (Sub-Agent 2.5: Tavily - NOT called yet)                            │
│                                                                       │
│  Combined Results: 107 documents (18 + 87 + 2)                       │
│  Cost: $0 (free APIs) | Latency: 3.2s (parallel)                    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│        AGENT 3: EVIDENCE NORMALIZER (Python Transformer)              │
│                                                                       │
│  Input: Raw results from 3 sources (107 docs)                        │
│  Process:                                                             │
│   • Convert all formats → EvidenceCandidate[]                        │
│   • Standardize metadata (id, title, text, source, metadata)         │
│   • Deduplicate (same PMID from different variants)                  │
│                                                                       │
│  Output: 107 EvidenceCandidate objects                               │
│  Cost: $0 | Latency: 0.3s                                            │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│     AGENT 4: TWO-STAGE RERANKER (BGE Cross-Encoder + Python)         │
│     Model: BAAI/bge-reranker-v2-m3 (HuggingFace)                     │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STAGE 1: Document-Level Reranking                            │   │
│  │  • Input: 107 EvidenceCandidate objects                       │   │
│  │  • For each: Use abstract/snippet (first 1500 chars)          │   │
│  │  • Create query-document pairs                                │   │
│  │  • BGE inference (32/batch on CPU):                           │   │
│  │    - Tokenize pairs (max_length=512)                          │   │
│  │    - Forward pass → logits                                    │   │
│  │    - Sigmoid normalization → scores [0-1]                     │   │
│  │  • Sort by score, select Top 20                               │   │
│  │                                                                │   │
│  │  Output: Top 20 documents                                     │   │
│  │  Latency: 2.8s                                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                        │
│                              ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ SUB-AGENT 2.3: Full-Text Fetcher (TRIGGERED)                 │   │
│  │  • For each of Top 20 docs with PMCID (14 docs):              │   │
│  │    - EFetch from PMC → JATS XML                              │   │
│  │    - Parse sections: intro, methods, results, discussion      │   │
│  │  • For docs without PMCID (6 docs):                           │   │
│  │    - Check Unpaywall API for open-access PDF (found 2)        │   │
│  │    - Others: Use abstract only                                │   │
│  │                                                                │   │
│  │  Output: 16 docs enriched with full-text, 4 abstract-only     │   │
│  │  Latency: 4.1s                                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                        │
│                              ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STAGE 2: Chunk-Level Reranking                               │   │
│  │  • Chunk each of 20 docs:                                     │   │
│  │    - Full-text docs: Chunk by section (1000 chars, 200 overlap)│  │
│  │    - Abstract-only: Single chunk                              │   │
│  │  • Total chunks: 94 chunks                                    │   │
│  │  • BGE inference on all chunks                                │   │
│  │  • Combine scores: 0.6*chunk_score + 0.4*doc_level_score      │   │
│  │  • Sort and select Top 10 chunks                              │   │
│  │                                                                │   │
│  │  Output: Final evidence pack (Top 10 chunks)                  │   │
│  │  Latency: 3.5s                                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  Total Cost: $0 (self-hosted) | Total Latency: 10.4s (2.8+4.1+3.5)  │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│      AGENT 5: EVIDENCE GAP ANALYZER (Gemini 3 Pro)                   │
│                                                                       │
│  Input: Query + Top 10 evidence chunks                               │
│  Process:                                                             │
│   • Analyze coverage: Does evidence address all query aspects?       │
│   • Check recency: Most recent source is 2024 (good)                 │
│   • Assess quality: 3 RCTs, 2 meta-analyses, 2 guidelines (excellent)│
│   • Detect contradictions: None found                                │
│   • Identify gaps: Limited data on eGFR exactly 30-50 range          │
│                                                                       │
│  Output: {                                                            │
│    "assessment": "sufficient",                                        │
│    "coverage_score": 0.85,                                            │
│    "recency_concerns": false,                                         │
│    "quality_distribution": {rcts: 3, meta_analyses: 2, ...},          │
│    "contradictions_detected": false,                                  │
│    "recommendation": "proceed"                                        │
│  }                                                                    │
│                                                                       │
│  Decision: PROCEED (no Tavily needed)                                │
│  Cost: $0.003 | Latency: 2.1s                                        │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│         AGENT 6: SYNTHESIS ENGINE (Gemini 3 Pro)                     │
│         [Pro triggered because complexity_score = 0.75]               │
│                                                                       │
│  Input:                                                               │
│   • Original query                                                    │
│   • Top 10 evidence chunks with full metadata                        │
│   • Gap analysis results                                             │
│                                                                       │
│  System Prompt Enforces:                                             │
│   • ONLY use provided evidence                                       │
│   • Every claim needs [N] citation                                   │
│   • Acknowledge contradictions if any                                │
│   • Structure: Answer → Evidence → Limitations                       │
│   • Max 500 words                                                    │
│   • NO recommendations                                               │
│                                                                       │
│  Process:                                                             │
│   • Format evidence sources with rank numbers                        │
│   • Call Gemini 3 Pro (temp=0.2)                                     │
│   • Extract inline citations from response                           │
│   • Map citation numbers to evidence pack                            │
│                                                                       │
│  Output:                                                              │
│   {                                                                   │
│     "synthesis": "For stroke prevention in patients with AF and...", │
│     "citations": [                                                    │
│       {number: 1, pmid: "35486828", title: "...", ...},              │
│       ...                                                             │
│     ],                                                                │
│     "tokens": {input: 2847, output: 743},                            │
│     "cost": 0.0071,                                                  │
│     "model_used": "gemini-2.0-pro-exp"                               │
│   }                                                                   │
│                                                                       │
│  Cost: $0.007 | Latency: 4.3s                                        │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│      AGENT 7: VERIFICATION GATE (Gemini 3 Flash Thinking)            │
│                                                                       │
│  Input: Synthesis + Evidence pack                                    │
│  Process:                                                             │
│   1. Extract claims (sentences) from synthesis → 18 claims           │
│   2. Check citation coverage:                                        │
│      • Claims with citations: 17/18                                  │
│      • Uncited claims: 1 (intro sentence - acceptable)               │
│   3. Validate citation numbers:                                      │
│      • All cited numbers [1-10] exist in evidence pack ✓             │
│   4. Grounding check (semantic similarity):                          │
│      • For each claim, verify against cited sources                  │
│      • All claims supported (similarity > 0.7) ✓                     │
│   5. Calculate grounding score: 17/18 = 0.94                         │
│                                                                       │
│  Validation Results: {                                                │
│    "total_claims": 18,                                                │
│    "cited_claims": 17,                                                │
│    "uncited_claims": ["Both agents are effective..."],               │
│    "invalid_citations": [],                                           │
│    "unsupported_claims": [],                                          │
│    "hallucination_detected": false,                                   │
│    "grounding_score": 0.94,                                           │
│    "passed": true                                                     │
│  }                                                                    │
│                                                                       │
│  Decision: PASS ✓                                                     │
│  Cost: $0.0005 | Latency: 1.8s                                       │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    FINAL RESPONSE TO USER                             │
│                                                                       │
│  ════════════════════════════════════════════════════════════════    │
│                                                                       │
│  For stroke prevention in patients with non-valvular atrial           │
│  fibrillation and moderate chronic kidney disease (eGFR 30-50        │
│  mL/min), both apixaban and rivaroxaban are effective, but           │
│  apixaban is associated with lower bleeding risk while maintaining    │
│  similar efficacy [1][2].                                             │
│                                                                       │
│  Evidence Summary:                                                    │
│  • Large real-world cohort (N=563,107) found apixaban had lower      │
│    major bleeding (HR 0.62, 95% CI 0.56-0.69) and stroke/SE          │
│    (HR 0.88, 95% CI 0.81-0.95) vs rivaroxaban [1].                  │
│  • Subgroup analysis in CKD: Safety advantage persisted in           │
│    eGFR 30-50 mL/min range [2][3].                                   │
│  • Network meta-analysis confirmed lower bleeding with apixaban       │
│    across CKD stages [4].                                             │
│  • Dosing: Apixaban 5mg BID (reduce to 2.5mg if ≥2 criteria);       │
│    Rivaroxaban 15mg QD for eGFR 15-50 mL/min [5][6].                │
│                                                                       │
│  Important Limitations:                                               │
│  • No direct RCT comparison; based on observational data              │
│  • Apixaban has less renal excretion (~25% vs ~36%) which may        │
│    contribute to better safety in CKD [7]                             │
│                                                                       │
│  References:                                                          │
│  [1] Ray WA, et al. Association of Rivaroxaban vs Apixaban...        │
│      JAMA. 2021;326(23):2395-2404. PMID: 35486828                    │
│      https://doi.org/10.1001/jama.2021.21222                          │
│  [2] Fralick M, et al. Effectiveness and Safety of Apixaban...       │
│      Ann Intern Med. 2020;172(7):463-473. PMID: 32053298             │
│  [3] Lau WCY, et al. Comparative Effectiveness and Safety...         │
│      Ann Intern Med. 2022;175(11):1515-1524. PMID: 36155464          │
│  [... references 4-10 ...]                                            │
│                                                                       │
│  ────────────────────────────────────────────────────────────────    │
│  📊 Query Metadata:                                                   │
│  Sources: 10 evidence chunks from 8 unique articles                  │
│  Latency: 23.7s total (Retrieval: 14s | Synthesis: 6s | Verify: 2s) │
│  Cost: $0.0116 USD                                                   │
│  Grounding Score: 94%                                                 │
│  Citation Coverage: 94% (17/18 claims cited)                         │
│  Hallucination Detected: No ✓                                         │
│  ════════════════════════════════════════════════════════════════    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  ARIZE TRACING FINALIZED                              │
│                                                                       │
│  Full trace logged with:                                             │
│   • Agent-level spans (7 agents)                                     │
│   • Sub-agent spans (retrieval sources)                              │
│   • Token counts per LLM call                                        │
│   • Cost breakdown                                                   │
│   • Latency per stage                                                │
│   • Validation metrics (grounding, citations)                        │
│   • Evidence quality distribution                                    │
│                                                                       │
│  Available in LLM Observatory dashboard for monitoring               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. ARIZE AI OBSERVABILITY IMPLEMENTATION

### Complete Logging Functions

```python
from arize.pandas.logger import Client
from arize.utils.types import Environments, ModelTypes, Metrics
import pandas as pd

class ArizeLogger:
    def __init__(self, space_key: str, api_key: str):
        self.client = Client(space_key=space_key, api_key=api_key)
        self.environment = Environments.PRODUCTION
        
    def log_agent_execution(self, agent_name: str, trace_id: str,
                           input_data: Dict, output_data: Dict,
                           model_name: str = None,
                           token_count: Dict = None,
                           cost_usd: float = None,
                           latency_ms: int = None):
        """
        Log single agent execution to Arize
        """
        
        # Create pandas DataFrame for logging
        log_data = {
            'prediction_id': [trace_id + '_' + agent_name],
            'prediction_timestamp': [int(time.time())],
            'agent_name': [agent_name],
            'model_name': [model_name or 'N/A'],
            'input': [json.dumps(input_data)],
            'output': [json.dumps(output_data)],
            'latency_ms': [latency_ms or 0],
            'cost_usd': [cost_usd or 0.0]
        }
        
        if token_count:
            log_data['input_tokens'] = [token_count.get('input', 0)]
            log_data['output_tokens'] = [token_count.get('output', 0)]
            log_data['total_tokens'] = [token_count.get('total', 0)]
        
        df = pd.DataFrame(log_data)
        
        # Log to Arize
        response = self.client.log(
            dataframe=df,
            model_id=f"open_work_{agent_name}",
            model_type=ModelTypes.GENERATIVE_LLM if model_name else ModelTypes.NUMERIC,
            environment=self.environment,
            prediction_id_column_name='prediction_id',
            timestamp_column_name='prediction_timestamp'
        )
        
        return response.status_code == 200
    
    def log_final_synthesis(self, trace_id: str, query: str,
                           synthesis_data: Dict, validation_results: Dict,
                           total_latency_ms: int, total_cost: float):
        """
        Log final end-to-end synthesis with all metrics
        """
        
        log_data = {
            'prediction_id': [trace_id],
            'prediction_timestamp': [int(time.time())],
            'query': [query],
            'synthesis': [synthesis_data['synthesis']],
            'num_sources': [len(synthesis_data['evidence_pack'])],
            'num_citations': [len(synthesis_data['citations'])],
            'grounding_score': [validation_results['grounding_score']],
            'citation_coverage': [validation_results['cited_claims'] / validation_results['total_claims']],
            'hallucination_detected': [validation_results['hallucination_detected']],
            'total_latency_ms': [total_latency_ms],
            'total_cost_usd': [total_cost],
            'model_used': [synthesis_data['model_used']]
        }
        
        df = pd.DataFrame(log_data)
        
        response = self.client.log(
            dataframe=df,
            model_id="open_work_end_to_end",
            model_type=ModelTypes.GENERATIVE_LLM,
            environment=self.environment,
            prediction_id_column_name='prediction_id',
            timestamp_column_name='prediction_timestamp',
            prediction_label_column_name='synthesis',
            actual_label_column_name=None  # No ground truth available in real-time
        )
        
        return response.status_code == 200
```

---

## 6. HACKATHON DELIVERABLES CHECKLIST

✅ **Gemini 3.0 Models**: Using Flash Thinking + Pro  
✅ **Multi-Agent Architecture**: 7 specialized agents with clear responsibilities  
✅ **Evidence-First Design**: Zero-hallucination commitment through validation  
✅ **Observability**: Full Arize AI integration with tracing  
✅ **Production-Ready**: Async architecture, error handling, cost tracking  
✅ **Responsible AI**: No clinical recommendations, transparency, validation gate  
✅ **Novel Use Case**: First comprehensive medical evidence synthesis with full observability  
✅ **Documentation**: This complete guide (45+ pages)

---

## 7. NEXT STEPS FOR HACKATHON SUBMISSION

1. **Week 1**: Implement Agents 1-3 (Query → Retrieval → Normalization)
2. **Week 2**: Implement Agent 4 (BGE re-ranker setup and testing)
3. **Week 3**: Implement Agents 5-7 (Gap analysis → Synthesis → Verification)
4. **Week 4**: Arize integration + LLM Observatory dashboard
5. **Week 5**: Testing with OE 10-query eval set
6. **Week 6**: Streamlit UI + demo video

**Success Metrics**:

- Grounding score >85% on all 10 test queries
- Hallucination rate <5%
- Latency <30s end-to-end
- Cost <$0.02 per query

---

**Your north star: Evidence fidelity through intelligent orchestration.**
