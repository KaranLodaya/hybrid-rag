# RAG Pipeline Edge Case Catalogue
# Version: 1.0 — "Bulletproof" Logic Reference

This document serves as the master reference for all possible failure modes and edge cases within the Hybrid RAG system. Each ID is mapped to a specific implementation in the codebase (e.g., in `ingestion.py` or `retrieval.py`).

---

## 1. Ingestion Edge Cases (I-Series)

| ID | Case | Severity | Mitigation / Handling Strategy |
|---|---|---|---|
| **I-01** | Empty File Upload | Low | Frontend validation to prevent POST; Backend check for file size > 0. |
| **I-02** | File Exceeds 10MB | Low | Nginx/FastAPI `max_content_length` limit + UI warning. |
| **I-03** | Unsupported Extension | Low | Strict whitelist: `.pdf`, `.docx`, `.txt`, `.md`. |
| **I-04** | Malformed PDF Header | Medium | `try-except` on PDF loader; flag as `failed` with user-friendly toast. |
| **I-05** | Password Protected PDF | Medium | Detect encryption status; prompt user for password or fail gracefully. |
| **I-06** | Image-Only PDF (No Text) | Medium | OCR fallback (Phase 5) or prompt user that file is unreadable. |
| **I-07** | Text-Heavy with Zero Semantic Value | Low | Chunker ignores chunks with 0 tokens or only whitespace. |
| **I-08** | Duplicate File Upload | Low | SHA-256 Hash check; link new metadata to existing chunks to save storage. |
| **I-09** | Postgres Sparse Index Delay | Low | Transactional WAL ensures index is searchable upon commit. |
| **I-10** | Embedding Service Timeout | High | 3x retry with exponential backoff in Celery worker. |
| **I-11** | Embedding Service Rate Limit | High | **Throttling Logic**: 4s delay between Gemini batches (15 RPM). |
| **I-12** | Model Dimension Mismatch | High | Strict config check: reject query if model dim != index dim. |
| **I-13** | Chunking Overflow | Medium | Recursive character splitting ensures no chunk exceeds 1,000 tokens. |
| **I-14** | Workspace Isolation Breach | Critical | Mandatory `workspace_id` filter in every SQL query at the ORM level. |
| **I-15** | Cross-Model Mixed Indices | High | Tag chunks with `embedding_model`; multi-vector RRF search. |

---

## 2. Retrieval Edge Cases (R-Series)

| ID | Case | Severity | Mitigation / Handling Strategy |
|---|---|---|---|
| **R-01** | Empty Query | Low | Backend early return; "Please ask a question" response. |
| **R-02** | No Relevant Context Found | Low | **Fortress Mode**: "I don't know based on your sources." |
| **R-03** | Query Exceeds Token Limit | Medium | Truncate query text to first 512 tokens for embedding stability. |
| **R-04** | Context Window Overflow | High | Rank-aware truncation: top $K$ chunks until 128k/1M limit hit. |
| **R-05** | Conflicting Sources | Medium | Prompt LLM to identify and highlight contradictions in citations. |
| **R-06** | Hallucination in Citation | High | Post-processing: verify every `[N]` exists in the retrieved chunk list. |
| **R-07** | Low-Score Relevance | Low | If top RRF score < 0.05, return "Low confidence" warning. |
| **R-08** | Ambiguous Natural Language | Medium | Use "Agentic Re-writing" to clarify the query before retrieval. |
| **R-09** | Database Connection Spike | Medium | Use Pgbouncer or connection pooling in SQLAlchemy. |
| **R-10** | pgvector Latency (Index Bloat) | High | Automated `REINDEX` or HNSW optimization when > 100k chunks. |

---

## 3. Infrastructure & TTL Edge Cases (H-Series)

| ID | Case | Severity | Mitigation / Handling Strategy |
|---|---|---|---|
| **H-01** | Database Disk Full (1GB Limit) | Critical | **Adaptive TTL**: Auto-prune volatile docs when DB > 900MB. |
| **H-02** | Redis Queue Overflow | Medium | TTL for Celery tasks; monitor queue depth with Prometheus. |
| **H-03** | Render Container Spin-down | Low | "Warming Up" UI pulse; frontend polling for 200 OK. |
| **H-04** | API Key Expiry (Gemini/HF) | High | System health check (Phase 6) alerts dashboard of missing keys. |
| **H-05** | Memory Leak in Worker | Medium | `max-tasks-per-child` setting in Celery to restart workers. |

---

## 4. UI/UX Edge Cases (U-Series)

| ID | Case | Severity | Mitigation / Handling Strategy |
|---|---|---|---|
| **U-01** | Long Response Stalling | Low | Server-Sent Events (SSE) for real-time token streaming. |
| **U-02** | Rapid-fire Message Sending | Low | Debounce / Rate-limit message button in React. |
| **U-03** | Workspace Switch mid-Chat | Medium | Reset local chat state or clear input on workspace change. |
| **U-04** | Citation Hover on Mobile | Low | Swap hover for "Tap to View" portal on touch devices. |
| **U-05** | Dark/Light Mode Mismatch | Low | CSS Variables using `@media (prefers-color-scheme)`. |

---

*This catalogue is a living document. Add new cases as they are discovered in Eval / Production.*
