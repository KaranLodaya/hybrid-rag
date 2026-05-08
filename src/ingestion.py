import uuid
from time import perf_counter
from typing import List, Optional
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    UnstructuredMarkdownLoader,
    Docx2txtLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from .config import settings

class IngestionPipeline:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100,
            separators=["\n\n", "\n", " ", ""]
        )

    def load_document(self, file_path: str, file_type: str):
        """Loads a document based on its file type."""
        normalized_file_type = (file_type or "").lower()

        if normalized_file_type == "pdf":
            loader = PyPDFLoader(file_path)
        elif normalized_file_type == "md":
            loader = UnstructuredMarkdownLoader(file_path)
        elif normalized_file_type == "docx":
            loader = Docx2txtLoader(file_path)
        else:
            loader = TextLoader(file_path)
        
        return loader.load()

    def split_documents(self, documents):
        """Splits documents into smaller chunks."""
        return self.text_splitter.split_documents(documents)

    def get_embedding_engine(self, batch_size: int, force_local: bool = False):
        """
        Hybrid Routing Engine:
        - If force_local=True: Use Hugging Face Inference API (Cost-effective fallback)
        - Otherwise: Use Gemini (High Precision)
        """
        if force_local and settings.huggingface_api_key:
            from langchain_community.embeddings import HuggingFaceInferenceEmbeddings
            return HuggingFaceInferenceEmbeddings(
                api_key=settings.huggingface_api_key,
                model_name=settings.hf_embedding_model
            ), settings.hf_embedding_model
        
        return GoogleGenerativeAIEmbeddings(
            model=settings.query_embedding_model,
            google_api_key=settings.google_api_key
        ), settings.query_embedding_model

    def embed_chunks(self, texts: List[str], batch_size: int, force_local: bool = False):
        """Generates embeddings for a list of text chunks with batching."""
        engine, model_name = self.get_embedding_engine(batch_size, force_local=force_local)
        
        # Batching logic for Gemini (recommended batch size is 16-32 for stability)
        batch_limit = 16
        all_embeddings = []
        batch_timings = []
        
        import time
        for i in range(0, len(texts), batch_limit):
            batch = texts[i : i + batch_limit]
            batch_start = perf_counter()
            batch_embeddings = engine.embed_documents(batch)
            batch_elapsed = perf_counter() - batch_start
            all_embeddings.extend(batch_embeddings)
            batch_timings.append({
                "batch_index": (i // batch_limit) + 1,
                "batch_size": len(batch),
                "seconds": round(batch_elapsed, 4),
            })
            
            # Throttle to stay under Gemini Free Tier limits (15 RPM)
            # 60 seconds / 15 requests = 1 request every 4 seconds
            if i + batch_limit < len(texts):
                time.sleep(4)
            
        return all_embeddings, model_name, batch_timings

pipeline = IngestionPipeline()
