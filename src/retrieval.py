import uuid
from typing import List, Dict, Any
from sqlalchemy import text
from .database import SessionLocal
from .config import settings
from .ingestion import pipeline

class HybridRetriever:
    def __init__(self):
        self.k = 60 # RRF constant

    def get_query_embeddings(self, query: str):
        """Generates query embeddings for both Gemini and BGE models."""
        # This implementation embeds the query with both models to support mixed indices.
        # In a fully optimized production setup, we might only embed with the models present in the workspace.
        
        gemini_vector = []
        bge_vector = []
        
        try:
            gemini_engine, _ = pipeline.get_embedding_engine(batch_size=1) # Force Gemini if configured
            gemini_vector = gemini_engine.embed_query(query)
        except Exception as e:
            pass # Handle if Gemini is not configured
            
        try:
            bge_engine, _ = pipeline.get_embedding_engine(batch_size=10) # Force BGE
            bge_vector = bge_engine.embed_query(query)
        except Exception as e:
            pass

        return gemini_vector, bge_vector

    def search(self, workspace_id: str, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Executes an improved Reciprocal Rank Fusion (RRF) search.
        Uses more flexible keyword matching and robust vector routing.
        """
        db = SessionLocal()
        
        # Phase 5: Intent Detection - Check if this is a general/summary request
        summary_keywords = ["summarize", "summarise", "summary", "overview", "what is this", "what is it", "about", "tell me about"]
        is_summary_request = any(keyword in query.lower() for keyword in summary_keywords)
        
        # 1. Get embeddings
        gemini_vec, bge_vec = self.get_query_embeddings(query)
        
        # 2. Build Query
        # We use dimensions to route vectors instead of fragile strings
        # Gemini: 768 dims, BGE: 384 dims (usually)
        
        ctes = []
        unions = []
        params = {"workspace_id": workspace_id, "query": query, "k": self.k, "limit": limit}
        
        if gemini_vec:
            # Match by dimension and workspace
            ctes.append(f"""
            gemini_hits AS (
                SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:gemini_query_vector AS vector)) + :k) as rrf_score
                FROM chunks
                WHERE vector_dims(embedding) = {len(gemini_vec)} 
                AND workspace_id = CAST(:workspace_id AS UUID)
                LIMIT 50
            )""")
            unions.append("SELECT * FROM gemini_hits")
            params["gemini_query_vector"] = str(gemini_vec)

        if bge_vec:
            ctes.append(f"""
            bge_hits AS (
                SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:bge_query_vector AS vector)) + :k) as rrf_score
                FROM chunks
                WHERE vector_dims(embedding) = {len(bge_vec)} 
                AND workspace_id = CAST(:workspace_id AS UUID)
                LIMIT 50
            )""")
            unions.append("SELECT * FROM bge_hits")
            params["bge_query_vector"] = str(bge_vec)

        # 3. Improved Sparse Search (Keyword Search)
        # We use websearch_to_tsquery for better natural language handling
        ctes.append("""
        sparse_hits AS (
            SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', :query)) DESC) + :k) as rrf_score
            FROM chunks
            WHERE (search_vector @@ websearch_to_tsquery('english', :query) OR text ILIKE '%' || :query || '%')
            AND workspace_id = CAST(:workspace_id AS UUID)
            LIMIT 50
        )""")
        unions.append("SELECT * FROM sparse_hits")

        # 4. Summary Intent Layer
        if is_summary_request:
            ctes.append("""
            summary_hits AS (
                SELECT id, 1.0 / (chunk_index + 1 + :k) as rrf_score
                FROM chunks
                WHERE workspace_id = CAST(:workspace_id AS UUID)
                AND chunk_index < 5
                LIMIT 20
            )""")
            unions.append("SELECT * FROM summary_hits")

        # 5. Assemble Final Query
        sql_query = f"""
        WITH {', '.join(ctes)}
        SELECT c.id, c.text, c.document_id, c.chunk_index, d.filename, c.chunk_metadata, SUM(combined.rrf_score) as total_score
        FROM (
            {' UNION ALL '.join(unions)}
        ) combined
        JOIN chunks c ON c.id = combined.id
        JOIN documents d ON d.id = c.document_id
        GROUP BY c.id, c.text, c.document_id, c.chunk_index, d.filename, c.chunk_metadata
        ORDER BY total_score DESC
        LIMIT :limit;
        """

        try:
            result = db.execute(text(sql_query), params).fetchall()
            
            hits = []
            retrieved_doc_ids = []
            for row in result:
                doc_id = str(row[2])
                retrieved_doc_ids.append(uuid.UUID(doc_id))
                hits.append({
                    "id": str(row[0]),
                    "text": row[1],
                    "document_id": doc_id,
                    "chunk_index": row[3],
                    "filename": row[4],
                    "metadata": row[5],
                    "score": float(row[6])
                })
            
            # Phase 4: Adaptive TTL - Update last accessed time for these documents
            if retrieved_doc_ids:
                from .database import Document
                db.query(Document).filter(Document.id.in_(list(set(retrieved_doc_ids)))).update(
                    {Document.last_accessed_at: text("now()")}, synchronize_session=False
                )
                db.commit()

            return hits
        except Exception as e:
            print(f"Retrieval Error: {e}")
            return []
        finally:
            db.close()

retriever = HybridRetriever()
