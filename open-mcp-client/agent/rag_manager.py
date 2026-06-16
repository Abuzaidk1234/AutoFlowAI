import os
import logging
from typing import List, Optional
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader, UnstructuredFileLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

load_dotenv()

logger = logging.getLogger("RAGManager")

class RAGManager:
    def __init__(self, persist_directory: str = "./chroma_db", org_fs_path: str = "./org_filesystem"):
        self.persist_directory = persist_directory
        self.org_fs_path = org_fs_path
        os.makedirs(self.org_fs_path, exist_ok=True)
        
        # We'll initialize the vector store lazily or on demand
        self.vector_store = None
        self.embeddings = None

    def _get_embeddings(self, preferred_model: str = "local"):
        google_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if preferred_model == "cloud" and google_key:
            return GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=google_key)
        else:
            if preferred_model == "cloud":
                logger.warning("GOOGLE_API_KEY/GEMINI_API_KEY not found, falling back to local FastEmbed embeddings.")
            # Use FastEmbed for high-performance local embeddings
            return FastEmbedEmbeddings(model_name="BAAI/bge-small-en-v1.5")

    def init_vector_store(self, preferred_model: str = "local"):
        self.embeddings = self._get_embeddings(preferred_model)
        self.vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings,
            collection_name="autoflow_knowledge"
        )
        logger.info("Vector store initialized.")

    def scan_and_index_org_fs(self):
        """Scan the org_filesystem directory and index any new or updated files."""
        logger.info(f"Scanning {self.org_fs_path} for files to index...")
        for filename in os.listdir(self.org_fs_path):
            file_path = os.path.join(self.org_fs_path, filename)
            if os.path.isfile(file_path):
                # Check if already indexed could be done here, but load_and_index_file handles it (overwrite/re-add)
                self.load_and_index_file(file_path)
        logger.info("Org filesystem scan complete.")

    def load_and_index_file(self, file_path: str):
        """Load a single file, split it, and add to index."""
        try:
            ext = os.path.splitext(file_path)[1].lower()
            if ext == ".pdf":
                loader = PyPDFLoader(file_path)
            elif ext == ".docx":
                loader = Docx2txtLoader(file_path)
            elif ext in [".txt", ".md", ".py", ".js", ".html", ".css"]:
                loader = TextLoader(file_path, encoding='utf-8')
            else:
                loader = UnstructuredFileLoader(file_path)

            docs = loader.load()
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            splits = text_splitter.split_documents(docs)
            
            # Add metadata about source
            for s in splits:
                s.metadata["source_type"] = "organizational"
                s.metadata["filename"] = os.path.basename(file_path)

            if not self.vector_store:
                self.init_vector_store()

            self.remove_from_index(os.path.basename(file_path))
            if not splits:
                logger.info(f"No indexable content found in file: {file_path}")
                return True
            
            self.vector_store.add_documents(splits)
            logger.info(f"Indexed file: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to index file {file_path}: {e}")
            return False

    def remove_from_index(self, filename: str):
        """Remove documents associated with a filename."""
        if not self.vector_store:
            return
        # Chroma supports deletion by metadata filter
        self.vector_store.delete(where={"filename": filename})
        logger.info(f"Removed from index: {filename}")

    def query(self, query_text: str, n_results: int = 5, preferred_model: str = "local"):
        if not self.vector_store:
            self.init_vector_store(preferred_model)
        
        results = self.vector_store.similarity_search(query_text, k=n_results)
        return results

rag_manager = RAGManager()
