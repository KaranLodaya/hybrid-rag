import uuid
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from src.database import Document, Chunk, Workspace
from src.config import settings

# Use the database URL from settings
engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)

def inspect_database():
    db = SessionLocal()
    try:
        # Count Workspaces
        ws_count = db.query(func.count(Workspace.id)).scalar()
        print(f"--- Database Stats ---")
        print(f"Workspaces: {ws_count}")
        
        # Count Documents
        doc_count = db.query(func.count(Document.id)).scalar()
        print(f"Documents: {doc_count}")
        
        # Count Chunks
        chunk_count = db.query(func.count(Chunk.id)).scalar()
        print(f"Total Chunks (Embeddings): {chunk_count}")
        print("-" * 25)

        if doc_count > 0:
            print("\n--- Recent Documents ---")
            docs = db.query(Document).order_by(Document.created_at.desc()).limit(5).all()
            for doc in docs:
                chunks_in_doc = db.query(func.count(Chunk.id)).filter(Chunk.document_id == doc.id).scalar()
                print(f"- {doc.filename} | Status: {doc.status} | Chunks: {chunks_in_doc} | ID: {str(doc.id)[:8]}...")
        
        if chunk_count > 0:
            print("\n--- Sample Chunk Metadata ---")
            chunk = db.query(Chunk).first()
            print(f"- Model used: {chunk.embedding_model}")
            print(f"- Vector Dim: {len(chunk.embedding)} dimensions")
            print(f"- Sample Text: {chunk.text[:100]}...")

    finally:
        db.close()

if __name__ == "__main__":
    inspect_database()
