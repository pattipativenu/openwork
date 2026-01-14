# MedGuidance AI - Project Description

## 🚨 The Problem

In the modern medical landscape, accessing accurate, verifiable clinical information is increasingly difficult.

* **For Clinicians**: The explosion of medical literature makes keeping up with the latest guidelines impossible. Doctors need rapid, high-precision answers at the point of care, not generic search results.
* **For Patients**: The internet is flooded with unverified health advice, misinformation, and complex medical jargon that is dangerous.
* **The Trust Gap**: Existing AI tools often hallucinate or cite non-existent studies. They behave as "decision-makers" rather than verifiable search instruments.

**I built MedGuidance AI** to solve this. It is **not a decision-driving tool** but a **source-first, point-of-search engine**. It collects evidence from trusted medical databases, processes it through a strict pipeline, and uses an LLM only for summarization—drastically reducing hallucination.

## 💡 The Approach

My core philosophy is **"Source-First, LLM-Second."** I do not rely on the LLM's internal knowledge base for facts. Instead, I built a sophisticated retrieval pipeline that grounds every answer in real-time medical data.

**1. The "Source-First" Pipeline**

* **Collection**: The system queries **57+ trusted medical databases** (PubMed, Cochrane, CDC, WHO, FDA, etc.)—**NO Google Search** is used.
* **Reranking**: All retrieved evidence is passed through a **BGE Cross-Encoder ("Beijing Re-ranker")**. This re-ranks sources based on semantic relevance to the specific clinical query, ensuring only the highest-quality evidence reaches the next stage.
* **Summarization**: Only *after* evidence is collected and reranked is it fed to the LLM. The LLM's role is strictly limited to reading this content and verifying/summarizing it.

**2. Dual-Mode Interface**

* **Doctor Mode**:
  * **High-Precision**: Tabbed interface with strict <500 word limit for efficiency.
  * **Text-Only**: Images disabled to focus on clinical data.
  * **Capabilities**: Drug interaction checks, guideline conflict resolution, and risk scoring.
* **General Mode**:
  * **Patient-Centric**: Jargon-free explanations with "When to See a Doctor" guidance.
  * **Safety Net**: Real-time crisis detection for self-harm queries.
  * **Smart Image Gateway**: Retrieves validated medical images (e.g., dermatology) while filtering noise.

**3. The PECS Citation System**

* **Verifiability**: Every claim is backed by an inline citation (`[Sources 1]`) linking to a real PMID or DOI.
* **Transparency**: Users can verify the exact journal, year, and study type.

## 🛠️ The Tech Stack

I selected this stack to ensure maximum performance, type safety, and observability:

**Frontend & Core**

* **Framework**: Next.js 16 (App Router)
* **Language**: TypeScript 5 (Strict Mode)
* **UI Library**: React 19, Tailwind CSS v4, Framer Motion
* **PDF Parsing**: `pdf-parse` for document ingestion
* **Markdown Rendering**: `react-markdown` with `rehype-raw`

**AI & Retrieval Pipeline**

* **Reasoning Engine**: OpenAI GPT-4o (Doctor Mode) & GPT-4o-mini (General Mode)
* **Reranking Model**: BGE Cross-Encoder (via `@xenova/transformers` / API)
* **Medical APIs**: 57+ direct integrations (NCBI E-utilities, OpenFDA, ClinicalTrials.gov, etc.)
* **Search Fallback**: Tavily Medical Search (only used if internal retrieval fails)

**Observability & Infrastructure**

* **LLM Tracing**: Arize Phoenix (OpenTelemetry) for full trace observability and hallucination detection.
* **Data Store**: Redis (`ioredis`) for caching and session management.
* **Deployment**: Vercel (Edge Functions)
* **Privacy**: Client-side storage (`localStorage`)—no centralized chat logs.

---
*MedGuidance AI is an educational tool designed to assist, not replace, professional medical judgment.*
