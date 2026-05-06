import uuid
from typing import List, Optional
from langchain_community.document_loaders import PyPDFLoader, TextLoader, UnstructuredMarkdownLoader
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
        if file_type == "pdf":
            loader = PyPDFLoader(file_path)
        elif file_type == "md":
            loader = UnstructuredMarkdownLoader(file_path)
        else:
            loader = TextLoader(file_path)
        
        return loader.load()

    def split_documents(self, documents):
        """Splits documents into smaller chunks."""
        return self.text_splitter.split_documents(documents)

    def get_embedding_engine(self, batch_size: int):
        """
        Dynamic Routing Logic:
        - If batch_size <= 5: Use Gemini (High Precision)
        - If batch_size > 5: Use Local BGE (Efficiency/Cost)
        """
        if batch_size <= 5 and settings.google_api_key:
            return GoogleGenerativeAIEmbeddings(
                model=settings.query_embedding_model,
                google_api_key=settings.google_api_key
            ), settings.query_embedding_model
        else:
            from langchain_community.embeddings import HuggingFaceBgeEmbeddings
            return HuggingFaceBgeEmbeddings(
                model_name=settings.ingestion_embedding_model,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            ), settings.ingestion_embedding_model

    def embed_chunks(self, texts: List[str], batch_size: int):
        """Generates embeddings for a list of text chunks."""
        engine, model_name = self.get_embedding_engine(batch_size)
        embeddings = engine.embed_documents(texts)
        return embeddings, model_name

pipeline = IngestionPipeline()
