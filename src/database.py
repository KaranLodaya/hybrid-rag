import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Boolean, Integer, JSON, create_engine, text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from pgvector.sqlalchemy import Vector
from .config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

class Workspace(Base):
    __tablename__ = "workspaces"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    documents = relationship("Document", back_populates="workspace")

class Document(Base):
    __tablename__ = "documents"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"))
    owner_id: Mapped[str] = mapped_column(String)
    filename: Mapped[str] = mapped_column(String)
    file_hash: Mapped[str] = mapped_column(String)
    format: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")
    volatility_score: Mapped[float] = mapped_column(Float, default=0.5)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ttl_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    doc_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    workspace = relationship("Workspace", back_populates="documents")
    chunks = relationship("Chunk", back_populates="document")

class Chunk(Base):
    __tablename__ = "chunks"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True)) # For DB filtering
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"))
    chunk_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(String)
    embedding: Mapped[List[float]] = mapped_column(Vector(None)) # Dimension varies
    embedding_model: Mapped[str] = mapped_column(String)
    strategy: Mapped[str] = mapped_column(String)
    token_count: Mapped[int] = mapped_column(Integer)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    document = relationship("Document", back_populates="chunks")

def init_db():
    Base.metadata.create_all(bind=engine)
    # Create the search_vector column manually as a generated tsvector
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS chunks_search_idx ON chunks USING GIN (search_vector);"))
        conn.commit()
