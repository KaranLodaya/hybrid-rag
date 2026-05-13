# Production Requirements Document
# RAG Pipeline with Hybrid Search Over Documents

---

> **Version:** 1.2 — "Adaptive Memory" Edition
> **Status:** Phase 0, 1, 2, 3, 4 Complete
> **Author:** Solo Portfolio Project
> **Last Updated:** May 2026
> **Target Scale:** 1,000–100,000+ documents (Logical Workspace Isolation)
> **Deployment:** Render (free tier) · Docker-first · GCP/AWS scalable
> **Auth:** API Key + Multi-tenant JWT Authentication
> **LLM Strategy:** Model-agnostic · Multi-provider · Managed & Local models
> **Queue:** Celery + Redis
> **Observability:** Langfuse · OpenTelemetry · Cost Tracking · Eval Dashboard
> **Total Phases:** 11 (Phase 0 → Phase 10)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Success Metrics](#3-success-metrics)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [Tech Stack with Justifications](#5-tech-stack-with-justifications)
6. [Data Models](#6-data-models)
7. [API Contract](#7-api-contract)
8. [Phase 0 — Infrastructure and Project Scaffolding](#8-phase-0--infrastructure-and-project-scaffolding)
9. [Phase 1 — Document Ingestion and Chunking Pipeline](#9-phase-1--document-ingestion-and-chunking-pipeline)
10. [Phase 2 — Hybrid Retrieval Engine](#10-phase-2--hybrid-retrieval-engine)
11. [Phase 3 — Generation and Citation Layer](#11-phase-3--generation-and-citation-layer)
12. [Phase 4 — Adaptive TTL (Dynamic Memory)](#12-phase-4--adaptive-ttl-dynamic-memory) [COMPLETED]
13. [Phase 5 — API, Dashboard, and Real-Time Experience](#13-phase-5--api-dashboard-and-real-time-experience)
14. [Phase 6 — Evaluation Framework](#14-phase-6--evaluation-framework)
15. [Phase 7 — Observability, Monitoring and Cost Tracking](#15-phase-7--observability-monitoring-and-cost-tracking)
16. [Phase 8 — Security and Authentication](#16-phase-8--security-and-authentication)
17. [Phase 9 — Deployment and DevOps](#17-phase-9--deployment-and-devops)
18. [Phase 10 — Future Scope: Agentic Workflows](#18-phase-10--future-scope-agentic-workflows)
19. [Edge Cases Master Reference](#19-edge-cases-master-reference)
20. [Scalability Design](#20-scalability-design)
21. [Risk Register](#21-risk-register)


## 1. Executive Summary

This PRD specifies the foundational design of a dual-audience Retrieval-Augmented Generation (RAG) system. The system is architected to serve two distinct user segments simultaneously:
1. **The Individual/Personal User:** Requiring zero-cost ingestion, local model execution, and small-scale document management.
2. **The Enterprise/Large Corpus User:** Requiring multi-tenant isolation, high-precision managed embeddings, and massive horizontal scale (100k+ docs).

### 1.1 High-Level Overview (The "Source-First" Assistant)

In simple terms, this project is a **Source-First AI Assistant** that prioritizes your data over its training. It is designed to be a "Zero-Trust" knowledge companion where the user provides the "brain" via document uploads.

**What it does:**
- **Prioritizes Your Facts:** Unlike general chatbots, it is restricted to your documents for information.
- **Restricted Internal Knowledge:** Its internal training is only used for "Small Talk" (greetings, polite conversation).
- **Dual Personality:**
    - **Mode 1 (Strict):** A "Fortress" mode where the AI is forbidden from answering anything not found in your sources.
    - **Mode 2 (Hybrid):** A "Break-out" mode where the AI combines your sources with its general knowledge for broader context.
- **Provides Proof:** Every factual claim in RAG mode includes a citation `[1]` that reveals an **Evidence Tooltip** on hover, showing the exact source snippet without leaving the chat.
- **Aesthetic:** High-end "Modern Monochrome" interface designed for long-form research, featuring high-fidelity dark ("Midnight Matte") and light ("Pure Studio") modes.

### 1.2 Core Innovation

The technical innovation is the **Dual-Mode Grounding Engine** combined with **Source-First Orchestration**. This allows users to toggle between a "Fortress" mode (where the AI knows nothing outside your files) and a "Genius" mode (where it combines your files with its global intelligence), all while maintaining zero-cost operation on the Render free tier.

### Design Pillars

| Pillar | Description |
|---|---|
| **Source-First** | The system's intelligence is anchored to user-provided documents. |
| **Small-Talk Filter** | In strict mode, internal LLM knowledge is only accessible for "small talk" (greetings, system info). |
| **Dual-Mode Grounding** | **Mode 1 (Strict):** Answers ONLY from sources; **Mode 2 (Hybrid):** AI can "break out" and use general knowledge. |
| **Unified Storage** | Single PostgreSQL 16 instance for Metadata + Vector + Sparse search. |
| **Workspace Isolation** | Logical multi-tenancy for personal/corporate separation. |
| **Modern Monochrome UI** | System-aware, ultra-minimalist research environment with hover-evidence badges. Supports seamless dark/light transitions. |
| **Adaptive TTL Engine** | Aggressively prunes old data to stay within free-tier storage limits (e.g., 1GB DB). |

---

## 2. Goals and Non-Goals

- Implement **Workspace Isolation**: Logical multi-tenancy where all data is tagged with a `workspace_id`.
- Support **Tiered Ingestion**: Personal users get 100% local embedding (BGE) by default; Enterprise users can force Gemini for everything.
- Implement **Role-Based Access Control (RBAC)** at the workspace level (Phase 7).
- Ingest 1,000–100,000+ mixed-format documents with sub-3s P95 latency.

### Non-Goals

- Real-time document streaming (batch/polling preferred).
- Native Multi-language support (English-first).
- Cross-workspace retrieval (isolation is strict for security).

---

## 3. Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Answer Faithfulness | ≥ 85% | LLM-as-judge on golden eval suite |
| Citation Accuracy | ≥ 80% | Citation verifier on golden eval suite |
| "Zero-Dollar" Ingestion | **$0.00** | Using local BGE models for bulky batches |
| "Free-Tier" Runtime | **Stable on 512MB** | Memory monitoring (Unified DB + Local MiniLM) |
| Retrieval NDCG@5 | ≥ 0.78 | Golden retrieval labels |
| Cost Per Query | < $0.005 average | Langfuse tracking (Gemini free tier credits) |

---

## 4. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                   │
│   Next.js (TS + Tailwind) Dashboard    External API Consumers         │
│           │                                      │                    │
│           └──────────────┬───────────────────────┘                    │
└──────────────────────────┼───────────────────────────────────────────┘
                           │ HTTPS + API Key
┌──────────────────────────▼───────────────────────────────────────────┐
│                      FASTAPI SERVICE                                  │
│  /v1/ask    /v1/ingest    /v1/documents    /v1/health    /v1/eval     │
│                           │                                           │
│          ┌────────────────┼───────────────────┐                       │
│          │                │                   │                       │
│     Auth MW          Rate Limit           Request Logger              │
└──────────┼────────────────┼───────────────────┼───────────────────────┘
           │                │                   │
┌──────────▼───────┐ ┌──────▼────────┐ ┌───────▼───────────────────────┐
│  RETRIEVAL       │ │  INGESTION    │ │   GENERATION                  │
│  ENGINE          │ │  PIPELINE     │ │   LAYER                       │
│                  │ │               │ │                               │
│  PostgreSQL      │ │  Celery +     │ │  Grounding Engine             │
│  (pgvector +     │ │  Redis Queue  │ │  (Strict vs. Hybrid Mode)     │
│   pg_search)     │ │               │ │                               │
│                  │ │  Loader       │ │  Small-Talk Filter            │
│  RRF (SQL-based) │ │  Chunker      │ │  Citation Verifier            │
│  Reranker        │ │  Embedder     │ │  Prompt Builder               │
│                  │ │  Deduplicator │ │  Adaptive TTL Engine          │
│                  │ │  Indexer      │ │                               │
└──────────────────┘ └───────────────┘ └───────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│  STORAGE LAYER                                                         │
│                                                                        │
│  PostgreSQL 16 (Unified: Metadata + Vector + Full-Text Search)         │
│  Redis (Cache + Queue)   Object Storage (Raw Docs)                     │
└────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────────────────────┐
│                     OBSERVABILITY LAYER                               │
│   Langfuse (LLM traces)   OpenTelemetry (APM)   Prometheus + Grafana  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 5. Tech Stack with Justifications

| Component | Tool | Why This Choice |
|---|---|---|
| Language | Python 3.11+ | Ecosystem standard for AI/ML. Async support via FastAPI. |
| API Framework | FastAPI | Async-native, automatic OpenAPI docs, production-grade. |
| **Database** | **PostgreSQL 16 + pgvector + pg_search** | Unified storage for vectors, full-text search, and metadata. Simplifies consistency and deployment. |
| **Embeddings** | **Dynamic Routing Strategy**: Gemini `text-embedding-004` (managed) for small batches; HuggingFace `bge-small-en-v1.5` (local) for bulky ingestion. |
| Sparse Search | `pg_search` (Postgres extension) | BM25-like search integrated into SQL. No separate index management required. |
| Reranker | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Free, fast, high-quality cross-encoder. Runs locally. |
| LLM (generation) | **Model-agnostic router** | GPT-4o, Claude Sonnet, Gemini Flash. Switchable via config. |
| Task Queue | **Celery + Redis** | Production-standard for handling background ingestion and TTL jobs. |
| Observability | **Langfuse** | LLM-specific tracing, cost tracking, and evaluation management. |
| **Frontend** | **Next.js 14 + Tailwind CSS** | Industry-standard for performant, SEO-friendly React apps. TypeScript for safety. |
| Deployment | Render (Backend) + Vercel (Frontend) | Optimal distribution: Edge for UI, containerized for processing. |

---

## 6. Data Models

### 6.1 Document

```python
class Document(BaseModel):
    id: UUID                          # Auto-generated
    workspace_id: UUID                # Multi-tenant isolation key
    owner_id: str                     # User identifier
    filename: str                     # Original file name
    file_hash: str                    # SHA-256 of raw file
    format: Literal["pdf","md","html","txt"]
    status: Literal["pending","processing","indexed","failed","duplicate"]
    volatility_score: float = 0.5     # 0.0 (static) to 1.0 (highly volatile)
    last_accessed_at: datetime
    ttl_expiry: Optional[datetime]    
    metadata: dict                    
    created_at: datetime
```

### 6.2 Chunk

```python
class Chunk(BaseModel):
    id: UUID
    workspace_id: UUID                # Critical for DB-level filtering
    document_id: UUID
    chunk_index: int                  
    text: str                         
    embedding: List[float]            
    embedding_model: str              
    strategy: Literal["fixed","recursive","semantic"]
    token_count: int
    is_duplicate: bool
    created_at: datetime
```

---

## 7. API Contract

| Method | Endpoint | Description |
|---|---|---|
| **POST** | `/v1/ingest` | Upload and process documents (PDF, MD, etc.). Triggers background Celery task. |
| **POST** | `/v1/ask` | Query the RAG system. Returns grounded answer with citations. |
| **GET** | `/v1/documents` | List all documents and their status for a specific `workspace_id`. |
| **DELETE** | `/v1/documents/{id}` | Permanently delete a document and its associated vector chunks. |
| **GET** | `/v1/health` | System health check, including database status and Adaptive TTL metrics. |
| **POST** | `/v1/workspaces` | Create a new isolated workspace/vault. |

---

## 8. Phase 0 — Infrastructure and Project Scaffolding [COMPLETED]

### Tasks

#### 8.1 Docker Compose (Local)
Standard `docker-compose.yml`:
- `api` — FastAPI
- `worker` — Celery
- `postgres` — **Unified DB** (Custom image with `pgvector` and `pg_search`)
- `redis` — Queue + Cache
- `frontend` — Next.js 14 Dashboard (TypeScript + Tailwind CSS), deployed to Vercel.

#### 8.2 Configuration (Settings.py)
Added `EMBEDDING_PROVIDER` and `EMBEDDING_MODEL` support.

```python
class Settings(BaseSettings):
    embedding_provider: Literal["openai", "gemini", "huggingface", "local"] = "local"
    ingestion_embedding_model: str = "BAAI/bge-small-en-v1.5"
    query_embedding_model: str = "models/text-embedding-004"
    
    # Database (Unified)
    database_url: str  # PostgreSQL 16+
    
    # Adaptive TTL
    ttl_enabled: bool = True
    base_ttl_days: int = 30
```

---

## 9. Phase 1 — Document Ingestion and Chunking Pipeline [COMPLETED]

### Tasks

#### 9.1 Dynamic Ingestion Routing (Hybrid Gemini/HF API)
The system automatically selects the embedding provider to balance precision and cost:

1. **Precision Path (Primary)**:
   - Provider: **Google Gemini (`models/gemini-embedding-001`)**.
   - Justification: Highest retrieval quality. Managed via API.
   - **Throttling**: Implemented **4s delay (RPM Throttling)** between batches to stay within Gemini Free Tier limits (15 RPM).
2. **Efficiency/Fallback Path (High Volume)**:
   - Provider: **Hugging Face Inference API (`BAAI/bge-small-en-v1.5`)**.
   - Justification: Used when Gemini quotas are hit. Zero-bloat integration (no local PyTorch download required).

#### 9.2 Simplified Indexing & Progress
- **Real-time Progress UI**: Added stages for Loading -> Splitting -> Embedding -> Finalizing.
- **Embedding Model Tagging**: Each chunk is tagged with `embedding_model` metadata.
- **Database-Backed Sparse Index**: `pg_search` handles sparse indexing within Postgres.
- **Celery Task Workflow**:
  - `detect_batch_volume()` -> `select_provider()` -> `chunk()` -> `embed()` -> `insert_to_postgres()`.
  - Postgres handles both Vector (pgvector) and Sparse (pg_search) indexing on insert.

---

## 10. Phase 2 — Hybrid Retrieval Engine [COMPLETED]

### Tasks

#### 10.1 Multi-Model Unified SQL Retrieval
Since the index may contain chunks from different embedding models (Gemini or BGE), the retrieval engine must use a multi-model query approach:

1. **Query Embedding**: The user's question is embedded using **both** models if the index is mixed, or just the relevant one if a filter is applied.
2. **Unified Search**: Hybrid Search is executed as a single SQL query using Reciprocal Rank Fusion (RRF), joining results from different vector spaces:

```sql
WITH gemini_hits AS (
  SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY embedding <=> :gemini_query_vector) + :k) as rrf_score
  FROM chunks
  WHERE embedding_model = 'gemini-004' 
    AND workspace_id = :workspace_id
  LIMIT 50
),
bge_hits AS (
  SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY embedding <=> :bge_query_vector) + :k) as rrf_score
  FROM chunks
  WHERE embedding_model = 'bge-small'
    AND workspace_id = :workspace_id
  LIMIT 50
),
sparse_hits AS (
  SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank_cd(search_vector, query) DESC) + :k) as rrf_score
  FROM chunks
  WHERE search_vector @@ query
    AND workspace_id = :workspace_id
  LIMIT 50
)
SELECT id, SUM(rrf_score) as total_score
FROM (
  SELECT * FROM gemini_hits UNION ALL 
  SELECT * FROM bge_hits UNION ALL 
  SELECT * FROM sparse_hits
) combined
GROUP BY id
ORDER BY total_score DESC
LIMIT 10;
```

#### 10.2 Database-Backed Sparse Search
- Sparse search is completely offloaded to the PostgreSQL database engine using `pg_search`.
- This avoids loading large indices into worker memory, saving ~200-500MB RAM and enabling the system to run on the Render free tier.

---

## 11. Phase 3 — Generation and Citation Layer [COMPLETED]

### Tasks

#### 11.1 Dual-Mode Grounding Engine
Connect the Hybrid Search output to an LLM (Gemini 1.5 Flash) using a configurable grounding strategy:
- **Status**: Implemented with Gemini 1.5 Flash integration.
- **Strict vs Hybrid**: UI toggle implemented to switch between grounding modes.

#### 11.2 Premium UI & Source Attribution
- **Cold-Start Warming UI**: Implemented a "Warming Up Engines" pulse-animation overlay for Render free-tier spin-ups.
- **Chat Persistence**: Added LocalStorage-based chat history and workspace management.
- **Source Attribution**: Implemented markdown-based citations and source mapping.

---

## 12. Phase 4 — Adaptive TTL (Dynamic Memory) [COMPLETED]

This component manages the document lifecycle to ensure the system remains within the constraints of the Render free tier (1GB DB limit) while prioritizing relevant data.

#### 12.1 Volatility-Based Forgetting
Documents are assigned a `volatility_score` upon ingestion, which determines their base lifespan.
- **Scoring Logic**:
    - **Low Volatility (0.1 - 0.3)**: Static documents like Legal Contracts, Personal Journals, or Core Documentation. Base TTL: 365 days.
    - **Medium Volatility (0.4 - 0.6)**: Project notes, technical specs, or active research. Base TTL: 90 days.
    - **High Volatility (0.7 - 1.0)**: News articles, temporary snippets, or social media exports. Base TTL: 14 days.
- **Dynamic Expiry Formula**: 
  `TTL_Expiry = Last_Accessed_At + (Base_TTL / Volatility_Score)`
  *Every time a document is retrieved as part of a /ask query, its `Last_Accessed_At` is updated, effectively "refreshing" its memory.*

#### 12.2 The "Never-Forget" Pin (User Override)
- Users can manually "Pin" a document in the Dashboard.
- Pinned documents have `volatility_score` set to `0.0` (effectively disabling TTL).

#### 12.3 Automated Cleanup Architecture
- **Worker**: Celery Beat scheduled task (`prune_expired_docs`).
- **Frequency**: Every 24 hours at 03:00 UTC.
- **Operation**:
    1. Identify `Document` records where `ttl_expiry < NOW()`.
    2. Batch delete associated `Chunks` from the unified PostgreSQL table (clearing both Vector and Sparse indices).
    3. Remove the raw file from `Object Storage`.
    4. Log the "forgetting" event in Langfuse for observability.

---

## 13. Phase 5 — API, Dashboard, and Real-Time Experience

This phase focuses on the user-facing interface and the seamless connection between the backend and frontend.

#### 13.1 FastAPI Production Endpoints
- **Streamed Response (`/v1/ask/stream`)**: Implementation of Server-Sent Events (SSE) to deliver LLM tokens to the UI as they are generated.
- **Ingestion Status (`/v1/documents/{id}/status`)**: Long-polling endpoint for the UI to track the Load -> Split -> Embed pipeline.

#### 13.2 "Modern Monochrome" Dashboard (Next.js 14)
- **The "Command Bar"**: A global search and workspace switcher inspired by Raycast/Linear.
- **Glassmorphic Sidebar**: Workspace navigation with real-time storage usage meters (DB % full).
- **Source-First Chat UI**:
    - **Evidence Tooltips**: Hovering over a citation `[1]` triggers a mini-portal showing the exact chunk text without context switching.
    - **Mode Switcher**: A prominent "Fortress vs. Genius" toggle in the header.

#### 13.3 Interaction Polish
- **Warming Up Pulse**: Since the Render free tier spins down after inactivity, the UI must show a "Warming Up" state while the first request wakes the container.
- **Auto-Scrolling & Markdown**: High-fidelity rendering of LaTeX, code blocks, and markdown tables.


---

## 14. Phase 6 — Evaluation Framework

To ensure the "Source-First" guarantee, we implement a rigorous evaluation pipeline using the **Ragas** framework combined with LLM-as-a-Judge.

#### 14.1 The "Golden" Test Suite
- A curated JSON dataset of `(Question, Context, Ground_Truth)` triplets.
- Covers edge cases like:
    - Ambiguous queries.
    - Queries with no relevant documents (testing "Strict Mode" refusal).
    - Multi-document reasoning.

#### 14.2 Core Metrics (Automated)
| Metric | Definition | Target |
|---|---|---|
| **Faithfulness** | Are the claims in the answer supported by the context? | > 0.90 |
| **Answer Relevancy** | Does the answer actually address the user's prompt? | > 0.85 |
| **Context Precision** | Are the most relevant chunks ranked at the top? | > 0.80 |
| **Citation Recall** | Are all factual claims properly attributed to a source? | 1.00 |

#### 14.3 Evaluation Workflow
1.  **Synthetic Data Generation**: Use Gemini 1.5 Pro to generate 50 questions from the uploaded corpus.
2.  **Batch Inference**: Run the RAG pipeline over the test set.
3.  **Grading**: Use `Gemini 1.5 Pro` (Judge) to score the `Gemini 1.5 Flash` (Student) output.

---

## 15. Phase 7 — Observability, Monitoring and Cost Tracking

#### 15.1 LLM Tracing (Langfuse)
- **Nested Spans**: Track timing for `Retrieval` -> `Reranking` -> `Generation`.
- **Token Usage**: Granular tracking of Input vs. Output tokens per request.
- **Cost Attribution**: Automatic calculation based on model-specific pricing.

#### 15.2 System Health
- **Prometheus/Grafana**: Monitor API response times (P99) and Celery task latency.
- **Vector DB Health**: Track `pgvector` HNSW index hit rates and disk usage.

---

## 16. Phase 8 — Security and Authentication

#### 16.1 Workspace Quotas (Free-Tier Protection)
To ensure system stability on the Render free tier, we implement strict resource limits per workspace:
- **Document Limit**: Max 50 documents per personal vault.
- **Storage Limit**: Max 100MB of raw text data per workspace.
- **Enforcement**: The `/v1/ingest` endpoint must perform a pre-flight count check and return a `403 Forbidden` if quotas are exceeded.

#### 16.2 Logical Workspace Isolation & Invitations
- **RLS (Row Level Security)**: Every database query is strictly filtered by `workspace_id`.
- **Member Management**:
    - **Ownership**: The `owner_id` of a workspace has full `ADMIN` rights.
    - **Invitations**: Implement a `workspace_access` table allowing owners to share their vault with other user IDs (Read-only vs. Read-Write).
- **Authentication**: JWT-based auth via Clerk or Auth0 with per-user workspace ownership.

#### 16.3 Privacy & Data Governance (Hard-Delete)
- **Hard-Delete Policy**: Deleting a document ([src/main.py:L204](file:///Users/karan/Documents/GitHub/hybrid-rag/src/main.py#L204)) triggers an immediate purge of associated vector chunks.
- **Filesystem Cleanup**: The raw file in the `uploads/` directory must be unlinked (`os.remove`) upon document deletion.
- **Strict Grounding**: System prompt constraints to prevent training-data leakage.


---

## 17. Phase 9 — Deployment and DevOps

- **CI/CD Pipeline**: GitHub Actions for automated linting, testing, and deployment.
- **Blue/Green Ingestion**: Ability to re-index documents without downtime.
- **Infrastructure as Code**: Terraform/Pulumi scripts for reproducible cloud environments.

---

## 18. Phase 10 — Future Scope: Agentic Workflows

- **Agentic Routing**: Dynamically deciding whether a question needs search, calculation, or a direct answer.
- **Multi-Hop Retrieval**: Automatically generating sub-questions for complex queries.
- **Interactive Source Editing**: Allowing users to correct the AI's "memory" in real-time.

## 19. Edge Cases Master Reference

For a complete list of all 50+ failure modes (I-Series, R-Series, U-Series, etc.), see the comprehensive [**Edge Case Catalogue**](file:///Users/karan/Documents/GitHub/hybrid-rag/docs/EDGE_CASES.md).

### 19.1 High-Severity Reference (Critical Path)

| ID | Case | Impact | Handling |
|---|---|---|---|
| **I-11** | **Rate Limit Triggered** | High | Exponential backoff for API calls. |
| **I-14** | **Workspace Breach** | Critical | Mandatory `workspace_id` filter in every SQL query. |
| **R-04** | **Context Window Overflow** | High | Rank-aware truncation to fit model limits. |
| **R-06** | **Citation Hallucination** | High | Post-processing: verify every `[N]` exists in retrieval list. |
| **H-01** | **Database Disk Full** | Critical | **Adaptive TTL Engine** aggressive pruning. |

---

## 20. Scalability Design

- **Vector Search Optimization**: HNSW indexing for high-volume workspaces.
- **Horizontal Scaling**: Scale Celery workers for ingestion bursts.
- **Database Reads**: Read replicas for PostgreSQL in enterprise setups.
- **Cache Layer**: Redis caching for common query-embedding pairs.

---

## 21. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embedding cost increase | Medium | High | **Two-layer strategy**: Fallback to local BGE. |
| Database Bloat | Medium | Medium | **Adaptive TTL Engine** aggressive pruning. |
| Vector Index Latency | Low | Medium | pgvector HNSW indexing and optimization. |
| Model Downtime | Low | High | Fallback to Hugging Face Inference API. |

---

*End of Document — RAG Pipeline PRD 1.0*


