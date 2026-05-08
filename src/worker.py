import os
import uuid
from datetime import datetime
from time import perf_counter
from celery import Celery
from .config import settings
from .database import SessionLocal, Document, Chunk
from .ingestion import pipeline

celery_app = Celery(
    "worker",
    broker=settings.redis_url,
    backend=settings.redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_default_queue="hybrid_rag_local",
)

@celery_app.task(name="src.worker.ingest_document")
def ingest_document(
    document_id: str,
    file_path: str,
    file_type: str,
    workspace_id: str,
    batch_size: int = 1,
    force_local: bool = False,
):
    def _is_gemini_quota_error(exc: Exception) -> bool:
        message = str(exc).upper()
        return "RESOURCE_EXHAUSTED" in message or "429" in message

    db = SessionLocal()
    start_time = datetime.now()
    total_start = perf_counter()
    load_split_seconds = None
    embedding_seconds = None
    try:
        doc = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
        if doc:
            doc.status = "processing"
            doc.doc_metadata = {
                **(doc.doc_metadata or {}),
                "ingestion_progress": {
                    "current_stage": "loading_split",
                    "started_at": datetime.utcnow().isoformat(),
                    "force_local": force_local,
                },
            }
            db.commit()

        # 1. Load and Split
        print(f"[{start_time}] Starting ingestion for {file_path}")
        load_split_start = perf_counter()
        docs = pipeline.load_document(file_path, file_type)
        chunks = pipeline.split_documents(docs)
        load_split_seconds = round(perf_counter() - load_split_start, 4)
        print(f"[{datetime.now()}] Split into {len(chunks)} chunks")
        
        # 2. Get Embeddings
        texts = [c.page_content for c in chunks]
        embed_start = perf_counter()
        try:
            embeddings, model_name, embedding_batches = pipeline.embed_chunks(
                texts,
                batch_size,
                force_local=force_local
            )
            embedding_seconds = round(perf_counter() - embed_start, 4)
        except Exception as embed_error:
            if doc and (not force_local) and _is_gemini_quota_error(embed_error):
                doc.status = "failed"
                doc.doc_metadata = {
                    **(doc.doc_metadata or {}),
                    "ingestion_progress": {
                        "current_stage": "awaiting_local_fallback_confirmation",
                        "chunks_count": len(chunks),
                        "load_split_seconds": load_split_seconds,
                        "can_resume_with_local": True,
                        "resume_action": "resume_with_local_embeddings",
                        "user_message": (
                            "Gemini embedding quota was reached. "
                            "You can continue this document using local embeddings."
                        ),
                        "error": str(embed_error),
                    },
                }
                db.commit()
                return {
                    "status": "awaiting_local_fallback_confirmation",
                    "document_id": document_id,
                    "can_resume_with_local": True,
                }
            raise embed_error

        print(f"[{datetime.now()}] Generated embeddings using {model_name} (Took: {embedding_seconds}s)")

        if doc:
            doc.doc_metadata = {
                **(doc.doc_metadata or {}),
                "ingestion_progress": {
                    "current_stage": "saving_db",
                    "chunks_count": len(chunks),
                    "load_split_seconds": load_split_seconds,
                    "embedding_seconds": embedding_seconds,
                    "embedding_batches": embedding_batches,
                    "embedding_model": model_name,
                    "force_local": force_local,
                },
            }
            db.commit()
        
        # 3. Save Chunks
        db_start = perf_counter()
        for i, (text, embedding) in enumerate(zip(texts, embeddings)):
            new_chunk = Chunk(
                id=uuid.uuid4(),
                workspace_id=uuid.UUID(workspace_id),
                document_id=uuid.UUID(document_id),
                chunk_index=i,
                text=text,
                embedding=embedding,
                embedding_model=model_name,
                strategy="recursive",
                token_count=len(text.split())
            )
            db.add(new_chunk)
        
        db.commit()
        db_save_seconds = round(perf_counter() - db_start, 4)
        total_seconds = round(perf_counter() - total_start, 4)
        print(f"[{datetime.now()}] Saved chunks to DB (Took: {db_save_seconds}s)")
        
        # 4. Update Document Status
        if doc:
            doc.status = "processed"
            doc.doc_metadata = {
                **(doc.doc_metadata or {}),
                "ingestion_progress": {
                    "current_stage": "complete",
                    "chunks_count": len(chunks),
                    "load_split_seconds": load_split_seconds,
                    "embedding_seconds": embedding_seconds,
                    "embedding_batches": embedding_batches,
                    "db_save_seconds": db_save_seconds,
                    "total_seconds": total_seconds,
                    "embedding_model": model_name,
                    "force_local": force_local,
                    "completed_at": datetime.utcnow().isoformat(),
                },
            }
        
        db.commit()
        print(f"[{datetime.now()}] Ingestion complete. Total time: {datetime.now() - start_time}")
        return {"status": "success", "chunks_created": len(texts), "model": model_name}
    
    except Exception as e:
        db.rollback()
        doc = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
        if doc:
            doc.status = "failed"
            doc.doc_metadata = {
                **(doc.doc_metadata or {}),
                "ingestion_progress": {
                    "current_stage": "failed",
                    "load_split_seconds": load_split_seconds,
                    "embedding_seconds": embedding_seconds,
                    "error": str(e),
                    "can_resume_with_local": False,
                    "force_local": force_local,
                },
            }
        db.commit()
        raise e
    finally:
        db.close()
