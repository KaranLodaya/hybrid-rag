# Hybrid RAG: Source-First Knowledge System

A production-grade Retrieval-Augmented Generation (RAG) system built with a **Source-First** philosophy. This system prioritizes user-uploaded documents as the primary intelligence source and offers dual-mode grounding for flexible AI interactions.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11%2B-blue.svg)
![Next.js](https://img.shields.io/badge/next.js-15-black.svg)
![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue.svg)

## 🌟 Key Features

- **🛡️ Dual-Mode Grounding:**
  - **Strict (Fortress Mode):** AI is strictly limited to your uploaded documents. Factual questions outside your sources are refused.
  - **Hybrid (Break-out Mode):** AI combines your local sources with its general intelligence for broader context.
- **🔍 Hybrid Retrieval Engine:** Combines **Dense Vector Search** (Gemini/BGE) with **Sparse Keyword Search** (BM25 via pg_search) using Reciprocal Rank Fusion (RRF).
- **📦 Unified Storage:** All metadata, vectors, and full-text indices are stored in a single PostgreSQL 16 instance.
- **🏠 Logical Workspace Isolation:** Multi-tenant architecture allowing isolated "Vaults" for different projects or users.
- **⚡ Async Ingestion:** Document processing is handled via Celery and Redis to ensure a responsive UI.

## 🛠️ Tech Stack

- **Backend:** FastAPI, SQLAlchemy, Celery, Redis
- **Frontend:** Next.js 15, Tailwind CSS, Lucide Icons
- **Database:** PostgreSQL 16 + `pgvector` + `pg_search` (ParadeDB)
- **AI Models:** Google Gemini (Flash & Pro), BGE-Small (Local Embeddings)

## 🚀 Quick Start (Docker)

Ensure you have Docker and Docker Compose installed.

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd hybrid-rag
   ```

2. **Configure Environment:**
   Create a `.env` file in the root directory:
   ```env
   GOOGLE_API_KEY=your_gemini_api_key
   DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/hybrid_rag
   REDIS_URL=redis://redis:6379/0
   ```

3. **Launch the stack:**
   ```bash
   docker-compose up -d
   ```

4. **Access the Dashboard:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage

1. **Create a Vault:** Use the "New Vault" button to create an isolated workspace.
2. **Upload Documents:** Drop PDFs, TXT, or MD files into the vault.
3. **Toggle Grounding:** Switch between **Strict** and **Hybrid** modes in the sidebar.
4. **Chat:** Ask questions about your documents and see real-time citations.

## 🛠️ Inspection Tools

Check your vector database status anytime:
```bash
docker exec hybrid_rag_api python src/inspect_db.py
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
