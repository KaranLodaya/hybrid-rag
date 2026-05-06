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
        """Executes the Reciprocal Rank Fusion (RRF) SQL Query across vectors and sparse text."""
        db = SessionLocal()
        
        gemini_vec, bge_vec = self.get_query_embeddings(query)
        
        # If a vector is empty, we pass a dummy vector to prevent SQL errors, 
        # but the RRF score for that CTE will simply be very low or we handle it via logic.
        # Since pgvector doesn't like empty arrays, we need to pass a zero array of correct dimension.
        # However, a cleaner way is to dynamically build the CTEs based on available vectors.
        
        # Build CTEs dynamically
        ctes = []
        unions = []
        params = {"workspace_id": workspace_id, "query": query, "k": self.k, "limit": limit}
        
        if gemini_vec:
            ctes.append(f"""
            gemini_hits AS (
                SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:gemini_query_vector AS vector)) + :k) as rrf_score
                FROM chunks
                WHERE embedding_model = '{settings.query_embedding_model}' AND workspace_id = CAST(:workspace_id AS UUID)
                LIMIT 50
            )""")
            unions.append("SELECT * FROM gemini_hits")
            params["gemini_query_vector"] = str(gemini_vec)

        if bge_vec:
            ctes.append(f"""
            bge_hits AS (
                SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:bge_query_vector AS vector)) + :k) as rrf_score
                FROM chunks
                WHERE embedding_model = '{settings.ingestion_embedding_model}' AND workspace_id = CAST(:workspace_id AS UUID)
                LIMIT 50
            )""")
            unions.append("SELECT * FROM bge_hits")
            params["bge_query_vector"] = str(bge_vec)

        # Always add Sparse Search CTE
        ctes.append("""
        sparse_hits AS (
            SELECT id, 1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', :query)) DESC) + :k) as rrf_score
            FROM chunks
            WHERE search_vector @@ plainto_tsquery('english', :query) AND workspace_id = CAST(:workspace_id AS UUID)
            LIMIT 50
        )""")
        unions.append("SELECT * FROM sparse_hits")

        # Assemble Final Query
        sql_query = f"""
        WITH {', '.join(ctes)}
        SELECT c.id, c.text, c.document_id, c.chunk_index, d.filename, SUM(combined.rrf_score) as total_score
        FROM (
            {' UNION ALL '.join(unions)}
        ) combined
        JOIN chunks c ON c.id = combined.id
        JOIN documents d ON d.id = c.document_id
        GROUP BY c.id, c.text, c.document_id, c.chunk_index, d.filename
        ORDER BY total_score DESC
        LIMIT :limit;
        """

        try:
            result = db.execute(text(sql_query), params).fetchall()
            
            # Format results
            hits = []
            for row in result:
                hits.append({
                    "chunk_id": str(row[0]),
                    "text": row[1],
                    "document_id": str(row[2]),
                    "chunk_index": row[3],
                    "filename": row[4],
                    "score": float(row[5])
                })
            return hits
        finally:
            db.close()

retriever = HybridRetriever()
