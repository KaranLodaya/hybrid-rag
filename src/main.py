import shutil
import os
import uuid
from typing import List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import init_db, SessionLocal, Workspace, Document, Chunk
from .worker import ingest_document

app = FastAPI(title="Hybrid RAG API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/v1/workspaces")
def list_workspaces():
    db = SessionLocal()
    workspaces = db.query(Workspace).all()
    db.close()
    return workspaces

@app.delete("/v1/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str):
    db = SessionLocal()
    try:
        ws_uuid = uuid.UUID(workspace_id)
        # Delete chunks -> documents -> workspace
        from .database import Chunk
        # Subquery to get all document IDs in this workspace
        doc_ids = db.query(Document.id).filter(Document.workspace_id == ws_uuid).all()
        doc_uuids = [d[0] for d in doc_ids]
        
        db.query(Chunk).filter(Chunk.document_id.in_(doc_uuids)).delete(synchronize_session=False)
        db.query(Document).filter(Document.workspace_id == ws_uuid).delete(synchronize_session=False)
        db.query(Workspace).filter(Workspace.id == ws_uuid).delete(synchronize_session=False)
        
        db.commit()
        return {"status": "deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/v1/workspaces")
def create_workspace(name: str):
    db = SessionLocal()
    workspace = Workspace(id=uuid.uuid4(), name=name)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    db.close()
    return workspace

@app.post("/v1/ingest")
async def ingest_file(
    workspace_id: str,
    file: UploadFile = File(...),
    owner_id: str = Form(...)
):
    db = SessionLocal()
    try:
        # 1. Verify workspace
        ws = db.query(Workspace).filter(Workspace.id == uuid.UUID(workspace_id)).first()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        # 2. Save file locally
        file_id = str(uuid.uuid4())
        file_type = file.filename.split(".")[-1]
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{file_type}")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Create Document Record
        new_doc = Document(
            id=uuid.UUID(file_id),
            workspace_id=uuid.UUID(workspace_id),
            owner_id=owner_id,
            filename=file.filename,
            file_hash="", # Should calculate hash in production
            format=file_type,
            status="pending",
            doc_metadata={
                "ingestion_progress": {
                    "current_stage": "queued"
                }
            }
        )
        db.add(new_doc)
        db.commit()

        # 4. Trigger Background Task
        ingest_document.delay(
            document_id=file_id,
            file_path=file_path,
            file_type=file_type,
            workspace_id=workspace_id,
            batch_size=1, # For single file upload
            force_local=False,
        )

        return {"document_id": file_id, "status": "processing"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/v1/ask")
def ask_question(workspace_id: str, query: str, mode: str = "strict", limit: int = 5):
    from .retrieval import retriever
    from .generation import generator
    
    try:
        # 1. Retrieve relevant chunks (RAG is always the first step)
        results = retriever.search(workspace_id=workspace_id, query=query, limit=limit)
        
        # 2. Generate answer based on Mode (Strict or Hybrid)
        answer = generator.generate_answer(query, results, mode=mode)
        
        return {
            "query": query,
            "workspace_id": workspace_id,
            "mode": mode,
            "answer": answer,
            "results": results
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v1/documents")
def list_documents(workspace_id: str):
    db = SessionLocal()
    docs = db.query(Document).filter(Document.workspace_id == uuid.UUID(workspace_id)).all()
    db.close()
    return docs

@app.post("/v1/documents/{document_id}/resume-local")
def resume_document_with_local_embeddings(document_id: str):
    db = SessionLocal()
    try:
        doc_uuid = uuid.UUID(document_id)
        doc = db.query(Document).filter(Document.id == doc_uuid).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        ingestion_progress = (doc.doc_metadata or {}).get("ingestion_progress", {})
        if not ingestion_progress.get("can_resume_with_local"):
            raise HTTPException(status_code=400, detail="Local fallback is not available for this document")

        file_path = os.path.join(UPLOAD_DIR, f"{document_id}.{doc.format}")
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Original uploaded file is missing")

        db.query(Chunk).filter(Chunk.document_id == doc_uuid).delete(synchronize_session=False)

        doc.status = "processing"
        doc.doc_metadata = {
            **(doc.doc_metadata or {}),
            "ingestion_progress": {
                **ingestion_progress,
                "current_stage": "local_fallback_queued",
                "user_message": "Continuing ingestion with local embeddings.",
            },
        }
        db.commit()

        ingest_document.delay(
            document_id=document_id,
            file_path=file_path,
            file_type=doc.format,
            workspace_id=str(doc.workspace_id),
            batch_size=9999,
            force_local=True,
        )

        return {"status": "processing", "document_id": document_id, "mode": "local_fallback"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.delete("/v1/documents/{document_id}")
def delete_document(document_id: str):
    db = SessionLocal()
    try:
        doc_uuid = uuid.UUID(document_id)
        # 1. Delete associated chunks first (due to foreign key)
        db.query(Chunk).filter(Chunk.document_id == doc_uuid).delete()
        # 2. Delete the document record
        db.query(Document).filter(Document.id == doc_uuid).delete()
        db.commit()
        return {"status": "deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "ttl_enabled": settings.ttl_enabled
    }
