# Import required FastAPI components for building the API
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# Import Pydantic for data validation and settings management
from pydantic import BaseModel
# Import OpenAI client for interacting with OpenAI's API
from openai import OpenAI
import os
import asyncio
import tempfile
from typing import Optional, Dict, Any
from pathlib import Path

# Import aimakerspace components for RAG functionality
import sys
sys.path.append(str(Path(__file__).parent.parent))
from aimakerspace.text_utils import PDFLoader, CharacterTextSplitter
from aimakerspace.vectordatabase import VectorDatabase
from aimakerspace.openai_utils.embedding import EmbeddingModel
from aimakerspace.openai_utils.chatmodel import ChatOpenAI

# Initialize FastAPI application with a title
app = FastAPI(title="RAG PDF Chat API")

# Configure CORS (Cross-Origin Resource Sharing) middleware
# This allows the API to be accessed from different domains/origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from any origin
    allow_credentials=True,  # Allows cookies to be included in requests
    allow_methods=["*"],  # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers in requests
)

# Global state for storing the current PDF's vector database and metadata
app.state.vector_db: Optional[VectorDatabase] = None
app.state.pdf_filename: Optional[str] = None
app.state.chunk_count: int = 0

# Define the data model for RAG chat requests using Pydantic
# This ensures incoming request data is properly validated
class RAGChatRequest(BaseModel):
    question: str           # User's question about the PDF
    model: Optional[str] = "gpt-4o-mini"  # Optional model selection with default
    api_key: str           # OpenAI API key for authentication

# Define response models for API endpoints
class UploadResponse(BaseModel):
    message: str
    filename: str
    chunk_count: int

class ChatResponse(BaseModel):
    answer: str
    sources_used: int
    has_pdf: bool

async def process_pdf_and_create_vector_db(pdf_content: bytes, filename: str, api_key: str) -> tuple[VectorDatabase, int]:
    """
    Process PDF content and create vector database for RAG.
    
    Args:
        pdf_content: Raw PDF file content as bytes
        filename: Name of the uploaded PDF file
        api_key: OpenAI API key for embeddings
        
    Returns:
        Tuple of (VectorDatabase instance, number of chunks created)
        
    Raises:
        HTTPException: If PDF processing or embedding creation fails
    """
    try:
        # Create temporary file to save PDF content
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_file:
            temp_file.write(pdf_content)
            temp_file_path = temp_file.name
        
        try:
            # Load PDF using aimakerspace PDFLoader
            pdf_loader = PDFLoader(temp_file_path)
            pdf_loader.load_file()
            
            if not pdf_loader.documents:
                raise HTTPException(status_code=400, detail="Could not extract text from PDF")
            
            # Split text into chunks
            text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = text_splitter.split_texts(pdf_loader.documents)
            
            if not chunks:
                raise HTTPException(status_code=400, detail="PDF appears to be empty or unreadable")
            
            # Set OpenAI API key for embedding model
            os.environ["OPENAI_API_KEY"] = api_key
            
            # Create vector database and populate with embeddings
            embedding_model = EmbeddingModel()
            vector_db = VectorDatabase(embedding_model=embedding_model)
            
            # Build vector database from chunks
            await vector_db.abuild_from_list(chunks)
            
            return vector_db, len(chunks)
            
        finally:
            # Clean up temporary file
            os.unlink(temp_file_path)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


@app.post("/api/upload-pdf", response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(..., description="PDF file to upload and index")
):
    """
    Upload and index a PDF file for RAG-based chat.
    
    Args:
        file: Uploaded PDF file
        
    Returns:
        UploadResponse with success message, filename, and chunk count
        
    Raises:
        HTTPException: If file validation or processing fails
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Check file size (limit to 50MB)
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 50MB")
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    
    # For this endpoint, we'll require an API key via header for initial processing
    # In a real application, you might want to handle this differently
    try:
        # Create a minimal vector database to test the API key
        # We'll process it fully when the first chat request comes in
        app.state.pdf_filename = file.filename
        app.state.pdf_content = content  # Store content temporarily
        app.state.vector_db = None  # Will be created on first chat request
        
        # Return success response (we'll process the PDF lazily on first chat)
        return UploadResponse(
            message="PDF uploaded successfully. It will be indexed when you ask your first question.",
            filename=file.filename,
            chunk_count=0  # Will be set when actually processed
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading PDF: {str(e)}")


@app.post("/api/chat", response_model=ChatResponse)
async def rag_chat(request: RAGChatRequest):
    """
    Answer questions using RAG with the uploaded PDF content.
    
    Args:
        request: RAGChatRequest containing user question, model, and API key
        
    Returns:
        ChatResponse with answer, source count, and PDF status
        
    Raises:
        HTTPException: If no PDF uploaded, processing fails, or OpenAI API fails
    """
    # Check if PDF has been uploaded
    if not app.state.pdf_filename:
        raise HTTPException(status_code=400, detail="No PDF uploaded. Please upload a PDF first.")
    
    try:
        # Process PDF if not already done (lazy loading)
        if app.state.vector_db is None:
            if not hasattr(app.state, 'pdf_content'):
                raise HTTPException(status_code=400, detail="PDF content not found. Please re-upload the PDF.")
            
            vector_db, chunk_count = await process_pdf_and_create_vector_db(
                app.state.pdf_content, 
                app.state.pdf_filename, 
                request.api_key
            )
            app.state.vector_db = vector_db
            app.state.chunk_count = chunk_count
            # Clear the stored content to save memory
            delattr(app.state, 'pdf_content')
        
        # Retrieve relevant context from vector database
        relevant_chunks = app.state.vector_db.search_by_text(
            request.question, 
            k=3,  # Get top 3 most relevant chunks
            return_as_text=True
        )
        
        if not relevant_chunks:
            return ChatResponse(
                answer="I am not sure.",
                sources_used=0,
                has_pdf=True
            )
        
        # Construct context from relevant chunks
        context = "\n\n".join(relevant_chunks)
        
        # Create RAG prompt that enforces context-only responses
        rag_prompt = f"""You are a helpful assistant that answers questions based ONLY on the provided context from a PDF document. 

IMPORTANT RULES:
1. Only answer based on the information provided in the context below
2. If the question cannot be answered from the context, respond with exactly: "I am not sure."
3. Do not use your general knowledge or training data
4. Be concise and direct in your answers
5. Do not mention that you are limited to the context

Context from PDF:
{context}

Question: {request.question}

Answer:"""

        # Set OpenAI API key for chat model
        os.environ["OPENAI_API_KEY"] = request.api_key
        
        # Generate response using ChatOpenAI
        chat_model = ChatOpenAI(model_name=request.model)
        response = chat_model.run([{"role": "user", "content": rag_prompt}])
        
        return ChatResponse(
            answer=response,
            sources_used=len(relevant_chunks),
            has_pdf=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing chat request: {str(e)}")


@app.get("/api/status")
async def get_status():
    """
    Get current system status including PDF upload information.
    
    Returns:
        Dict containing current PDF filename, chunk count, and system status
    """
    return {
        "status": "ok",
        "has_pdf": app.state.pdf_filename is not None,
        "pdf_filename": app.state.pdf_filename,
        "chunk_count": app.state.chunk_count,
        "vector_db_ready": app.state.vector_db is not None
    }


@app.delete("/api/pdf")
async def clear_pdf():
    """
    Clear the currently loaded PDF and reset the system.
    
    Returns:
        Dict with success message
    """
    app.state.vector_db = None
    app.state.pdf_filename = None
    app.state.chunk_count = 0
    if hasattr(app.state, 'pdf_content'):
        delattr(app.state, 'pdf_content')
    
    return {"message": "PDF cleared successfully"}


@app.get("/api/health")
async def health_check():
    """Legacy health check endpoint for compatibility."""
    return {"status": "ok"}


# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
