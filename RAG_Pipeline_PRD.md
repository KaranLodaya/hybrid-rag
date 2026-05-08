# Production Requirements Document
# RAG Pipeline with Hybrid Search Over Documents

---

> **Version:** 1.0 — Dual-Audience Architecture (Enterprise & Personal)
> **Status:** Active Development (Phases 0, 1, 3 Complete)
> **Author:** Solo Portfolio Project
> **Last Updated:** May 2026
> **Target Scale:** 1,000–100,000+ documents (Logical Workspace Isolation)
> **Deployment:** Render (free tier) · Docker-first · GCP/AWS scalable
> **Auth:** API Key + Multi-tenant JWT Authentication
> **LLM Strategy:** Model-agnostic · Multi-provider · Managed & Local models
> **Queue:** Celery + Redis
> **Observability:** Langfuse · OpenTelemetry · Cost Tracking · Eval Dashboard
> **Total Phases:** 10 (Phase 0 → Phase 9)

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
12. [Phase 4 — Evaluation Framework](#12-phase-4--evaluation-framework)
13. [Phase 5 — API and Dashboard](#13-phase-5--api-and-dashboard)
14. [Phase 6 — Observability, Monitoring and Cost Tracking](#14-phase-6--observability-monitoring-and-cost-tracking)
15. [Phase 7 — Security and Authentication](#15-phase-7--security-and-authentication)
16. [Phase 8 — Deployment and DevOps](#16-phase-8--deployment-and-devops)
17. [Edge Cases Master Reference](#17-edge-cases-master-reference)
18. [Scalability Design](#18-scalability-design)
19. [Risk Register](#19-risk-register)
20. [Open Questions and Future Scope](#20-open-questions-and-future-scope)

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

## 12. Phase 4 — Adaptive TTL (Dynamic Memory)

#### 12.1 Volatility-Based Forgetting
New component to manage document lifecycle based on usage and volatility.
- **Volatility Scoring**: Documents are tagged with a `volatility_score` (e.g., "Legal" = 0.1, "News" = 0.9).
- **TTL Calculation**: `Expiry = LastAccessed + (BaseTTL / Volatility)`.
- **Cleanup Job**: Periodic Celery task removes chunks of expired documents.

---

## 13. Phase 5 — Evaluation & Polish

- **Evaluation**: Implement LLM-as-a-judge for faithfulness and answer relevance.
- **UX Polish**: Final refinements to the Next.js dashboard.

## 13. Phase 5 — API and Dashboard

- Develop robust FastAPI endpoints (`/ask`, `/ingest`).
- Build a responsive Next.js dashboard using TypeScript and Tailwind CSS for document management and querying.
- Implement real-time streaming of LLM responses in the UI.

---

## 14. Phase 6 — Observability, Monitoring and Cost Tracking

- Integrate Langfuse for LLM traces and cost tracking per query.
- Use OpenTelemetry for API latency and DB query performance.

---

## 15. Phase 7 — Security and Authentication

- **Logical Workspace Isolation**: Every database query is strictly filtered by `workspace_id` at the row level to isolate personal vs. enterprise data.
- **Tiered Authentication**: Support API Keys (personal) and JWT/OAuth2 (enterprise integrations).
- **Privacy-First "Personal Mode"**: Local execution using BGE models to ensure zero data exfiltration.
- **Audit Logging**: Track data access and modifications for enterprise compliance.

---

## 16. Phase 8 — Deployment and DevOps

- Containerize all backend services using Docker.
- Deploy the Backend (FastAPI, Celery, Postgres) to Render.
- Deploy the Frontend to Vercel with environment variables pointing to the Render API.

---

## 17. Edge Cases Master Reference

### 17.1 Ingestion Edge Cases

| # | Edge Case | Severity | Handling |
|---|---|---|---|
| I-09 | **Postgres Sparse Index Delay** | Low | pg_search index updates are transactional. If delay occurs, it's handled by DB-level WAL. |
| I-15 | **Cross-Model Embedding Mismatch** | High | Ensure `EMBEDDING_PROVIDER` is consistent across ingestion and query, OR implement a transformation layer if using the two-layer experimental mode. |

### 17.2 Retrieval Edge Cases

| # | Edge Case | Severity | Handling |
|---|---|---|---|
| R-10 | **pgvector Performance Spike** | Medium | Use HNSW index for `pgvector` when chunk count > 5,000. |

---

## 18. Scalability Design

- **Vector Search Optimization**: Transition from exact search to HNSW index for `>5,000` chunks.
- **Horizontal Scaling**: Scale Celery workers horizontally for high-throughput ingestion.
- **Database Reads**: Implement read replicas for PostgreSQL if retrieval load increases.

---

## 19. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embedding model cost increase | Medium | High | **Two-layer strategy**: Switch query-time Gemini to local BGE if budget is exceeded. |
| Database Bloat (Postgres) | Medium | Medium | **Adaptive TTL Engine** automatically prunes stale/volatile documents. |
| Vector Index Latency | Low | Medium | pgvector HNSW indexing and Postgres query optimization. |

---

## 20. Open Questions and Future Scope

- **Multi-language Support**: Should we implement cross-lingual embeddings for global enterprise users?
- **Agentic Workflows**: Can we introduce agentic routing to handle complex, multi-step reasoning questions?
- **Granular RBAC**: Implement fine-grained Role-Based Access Control per document.

---

*End of Document — RAG Pipeline PRD 1.0*
