import os
import uuid
from src.database import init_db, SessionLocal, Workspace, Document, Chunk
from src.ingestion import pipeline
from src.retrieval import retriever

def run_test():
    print("1. Initializing Database...")
    init_db()
    
    db = SessionLocal()
    
    try:
        print("2. Creating Workspace...")
        workspace_id = uuid.uuid4()
        ws = Workspace(id=workspace_id, name="Test Workspace")
        db.add(ws)
        db.commit()
        print(f"   Workspace created: {workspace_id}")
        
        print("3. Creating Sample Document...")
        sample_text = "hybrid_rag is a production-ready dual-audience Retrieval-Augmented Generation system. It supports both personal and enterprise use cases using PostgreSQL, ParadeDB, and pgvector. It features Reciprocal Rank Fusion."
        
        with open("sample.txt", "w") as f:
            f.write(sample_text)
            
        print("4. Ingesting and Chunking Document...")
        docs = pipeline.load_document("sample.txt", "txt")
        chunks = pipeline.split_documents(docs)
        
        texts = [c.page_content for c in chunks]
        print(f"   Generated {len(texts)} chunks. Embedding them...")
        
        embeddings, model_name = pipeline.embed_chunks(texts, batch_size=1) 
        print(f"   Embedded using: {model_name}")
        
        doc_id = uuid.uuid4()
        # Create Document record first
        doc = Document(
            id=doc_id,
            workspace_id=workspace_id,
            owner_id="test_user",
            filename="sample.txt",
            file_hash="",
            format="txt",
            status="processing"
        )
        db.add(doc)
        db.commit() # Commit to ensure doc exists before chunks

        for i, (text, embedding) in enumerate(zip(texts, embeddings)):
            new_chunk = Chunk(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                document_id=doc_id,
                chunk_index=i,
                text=text,
                embedding=embedding,
                embedding_model=model_name,
                strategy="recursive",
                token_count=len(text.split())
            )
            db.add(new_chunk)
        
        db.commit()
        print("   Chunks saved to Database.")
        
        print("5. Running Hybrid Search (RRF)...")
        query = "What database does hybrid_rag use?"
        print(f"   Query: '{query}'")
        
        results = retriever.search(workspace_id=str(workspace_id), query=query, limit=2)
        
        print("\n--- RESULTS ---")
        for res in results:
            print(f"Score: {res['score']:.4f} | Text: {res['text']}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()
        if os.path.exists("sample.txt"):
            os.remove("sample.txt")

if __name__ == "__main__":
    run_test()
