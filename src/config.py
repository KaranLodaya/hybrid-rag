from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # API Keys
    google_api_key: str = ""
    huggingface_api_key: str = ""
    
    # Embedding Configuration
    embedding_provider: Literal["openai", "gemini", "huggingface", "local"] = "gemini"
    ingestion_embedding_model: str = "BAAI/bge-small-en-v1.5"
    query_embedding_model: str = "models/gemini-embedding-001"
    hf_embedding_model: str = "BAAI/bge-small-en-v1.5"
    llm_model: str = "models/gemini-flash-latest"
    
    # Database (Unified)
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5433/hybrid_rag"
    
    # Redis (Queue + Cache)
    redis_url: str = "redis://localhost:6379/0"
    
    # Adaptive TTL
    ttl_enabled: bool = True
    base_ttl_days: int = 30

settings = Settings()
