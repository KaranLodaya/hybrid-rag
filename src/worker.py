import os
import uuid
from datetime import datetime
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
)

@celery_app.task(name="src.worker.ingest_document")
def ingest_document(document_id: str, file_path: str, file_type: str, workspace_id: str, batch_size: int = 1):
    db = SessionLocal()
    try:
        # 1. Load and Split
        docs = pipeline.load_document(file_path, file_type)
        chunks = pipeline.split_documents(docs)
        
        # 2. Get Embeddings (Dynamic Routing happens here)
        texts = [c.page_content for c in chunks]
        embeddings, model_name = pipeline.embed_chunks(texts, batch_size)
        
        # 3. Save Chunks to Database
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
                token_count=len(text.split()) # Rough estimate
            )
            db.add(new_chunk)
        
        # 4. Update Document Status
        doc = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
        if doc:
            doc.status = "processed"
        
        db.commit()
        return {"status": "success", "chunks_created": len(texts), "model": model_name}
    
    except Exception as e:
        db.rollback()
        doc = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
        if doc:
            doc.status = "failed"
            doc.doc_metadata["error"] = str(e)
        db.commit()
        raise e
    finally:
        db.close()
