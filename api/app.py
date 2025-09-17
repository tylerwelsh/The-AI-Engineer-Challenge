# Import required FastAPI components for building the API
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# Import Pydantic for data validation and settings management
from pydantic import BaseModel
# Import OpenAI client for interacting with OpenAI's API
from openai import OpenAI
import os
import asyncio
import tempfile
import logging
import time
from typing import Optional, Dict, Any, List
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

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Global state for storing the current PDF's vector database and metadata
app.state.vector_db: Optional[VectorDatabase] = None
app.state.pdf_filename: Optional[str] = None
app.state.chunk_count: int = 0
app.state.is_processing: bool = False
app.state.processing_step: Optional[str] = None

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

class TopicSuggestionsResponse(BaseModel):
    suggestions: List[str]
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
    start_time = time.time()
    logger.info(f"🚀 Starting PDF processing for: {filename} ({len(pdf_content):,} bytes)")
    
    try:
        # Update processing status
        app.state.is_processing = True
        app.state.processing_step = "Creating temporary file"
        logger.info("📁 Creating temporary file for PDF processing")
        
        # Create temporary file to save PDF content
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_file:
            temp_file.write(pdf_content)
            temp_file_path = temp_file.name
        
        try:
            # Step 1: Load PDF
            app.state.processing_step = "Loading PDF content"
            logger.info(f"📖 Loading PDF from: {temp_file_path}")
            
            pdf_loader = PDFLoader(temp_file_path)
            pdf_loader.load_file()
            
            if not pdf_loader.documents:
                logger.error("❌ Could not extract text from PDF")
                raise HTTPException(status_code=400, detail="Could not extract text from PDF")
            
            total_text_length = sum(len(doc) for doc in pdf_loader.documents)
            logger.info(f"✅ PDF loaded successfully: {len(pdf_loader.documents)} pages, {total_text_length:,} characters")
            
            # Step 2: Split into chunks
            app.state.processing_step = "Splitting text into chunks"
            logger.info("✂️ Splitting text into chunks (1000 chars, 200 overlap)")
            
            text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = text_splitter.split_texts(pdf_loader.documents)
            
            if not chunks:
                logger.error("❌ PDF appears to be empty or unreadable")
                raise HTTPException(status_code=400, detail="PDF appears to be empty or unreadable")
            
            logger.info(f"✅ Text split into {len(chunks)} chunks")
            
            # Step 3: Set up embedding model
            app.state.processing_step = "Setting up OpenAI embedding model"
            logger.info("🔑 Setting up OpenAI API key and embedding model")
            
            os.environ["OPENAI_API_KEY"] = api_key
            embedding_model = EmbeddingModel()
            vector_db = VectorDatabase(embedding_model=embedding_model)
            
            # Step 4: Generate embeddings (this is the slow part)
            app.state.processing_step = f"Generating embeddings for {len(chunks)} chunks"
            logger.info(f"🧠 Generating embeddings for {len(chunks)} chunks (this may take a moment...)")
            
            embedding_start = time.time()
            await vector_db.abuild_from_list(chunks)
            embedding_time = time.time() - embedding_start
            
            logger.info(f"✅ Embeddings generated in {embedding_time:.2f} seconds")
            
            total_time = time.time() - start_time
            logger.info(f"🎉 PDF processing completed in {total_time:.2f} seconds!")
            logger.info(f"📊 Final stats: {len(chunks)} chunks, {total_text_length:,} characters, ready for RAG queries")
            
            return vector_db, len(chunks)
            
        finally:
            # Clean up temporary file
            logger.info(f"🧹 Cleaning up temporary file: {temp_file_path}")
            os.unlink(temp_file_path)
            
    except HTTPException:
        app.state.processing_step = None
        app.state.is_processing = False
        raise
    except Exception as e:
        logger.error(f"❌ Error processing PDF: {str(e)}")
        app.state.processing_step = None
        app.state.is_processing = False
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")
    finally:
        app.state.processing_step = None
        app.state.is_processing = False


@app.post("/api/upload-pdf", response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(..., description="PDF file to upload and index"),
    api_key: str = Form(..., description="OpenAI API key for processing")
):
    """
    Upload and immediately process a PDF file for RAG-based chat.
    
    Args:
        file: Uploaded PDF file
        api_key: OpenAI API key for processing embeddings
        
    Returns:
        UploadResponse with success message, filename, and chunk count
        
    Raises:
        HTTPException: If file validation or processing fails
    """
    # Validate API key
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=400, detail="OpenAI API key is required for processing")
        
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Check file size (limit to 50MB)
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 50MB")
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    
    logger.info(f"📤 PDF upload received: {file.filename} ({len(content):,} bytes)")
    
    try:
        # Clear any previous PDF data
        app.state.vector_db = None
        app.state.chunk_count = 0
        app.state.pdf_filename = file.filename
        
        # Process PDF immediately upon upload
        logger.info("🚀 Starting immediate PDF processing...")
        vector_db, chunk_count = await process_pdf_and_create_vector_db(
            content, 
            file.filename, 
            api_key
        )
        
        # Store the processed results
        app.state.vector_db = vector_db
        app.state.chunk_count = chunk_count
        
        logger.info(f"✅ PDF upload and processing completed: {chunk_count} chunks ready for queries")
        
        return UploadResponse(
            message=f"PDF processed successfully! {chunk_count} chunks indexed and ready for questions.",
            filename=file.filename,
            chunk_count=chunk_count
        )
        
    except HTTPException:
        # Reset state on failure
        app.state.vector_db = None
        app.state.pdf_filename = None
        app.state.chunk_count = 0
        raise
    except Exception as e:
        # Reset state on failure
        app.state.vector_db = None
        app.state.pdf_filename = None
        app.state.chunk_count = 0
        logger.error(f"❌ Error uploading/processing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


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
        # Check if PDF has been processed (should be processed upon upload)
        if app.state.vector_db is None:
            raise HTTPException(status_code=400, detail="PDF not processed yet. Please re-upload the PDF.")
            
        logger.info(f"🔍 Searching for relevant content in {app.state.chunk_count} chunks")
        
        # Retrieve relevant context from vector database
        relevant_chunks = app.state.vector_db.search_by_text(
            request.question, 
            k=3,  # Get top 3 most relevant chunks
            return_as_text=True
        )
        
        if not relevant_chunks:
            logger.info("⚠️ No relevant chunks found for question")
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

        logger.info("🤖 Generating response using OpenAI")
        
        # Set OpenAI API key for chat model
        os.environ["OPENAI_API_KEY"] = request.api_key
        
        # Generate response using ChatOpenAI
        chat_model = ChatOpenAI(model_name=request.model)
        response = chat_model.run([{"role": "user", "content": rag_prompt}])
        
        logger.info(f"✅ Generated response: {response[:100]}{'...' if len(response) > 100 else ''}")
        
        return ChatResponse(
            answer=response,
            sources_used=len(relevant_chunks),
            has_pdf=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error processing chat request: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing chat request: {str(e)}")


@app.get("/api/status")
async def get_status():
    """
    Get current system status including PDF upload and processing information.
    
    Returns:
        Dict containing current PDF filename, chunk count, processing status, and system status
    """
    return {
        "status": "ok",
        "has_pdf": app.state.pdf_filename is not None,
        "pdf_filename": app.state.pdf_filename,
        "chunk_count": app.state.chunk_count,
        "vector_db_ready": app.state.vector_db is not None,
        "is_processing": app.state.is_processing,
        "processing_step": app.state.processing_step
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


@app.get("/api/suggest-topics", response_model=TopicSuggestionsResponse)
async def suggest_topics(api_key: str):
    """
    Generate topic suggestions based on the uploaded PDF content.
    
    Args:
        api_key: OpenAI API key for generating suggestions
        
    Returns:
        TopicSuggestionsResponse with suggested questions and PDF status
        
    Raises:
        HTTPException: If no PDF uploaded or processing fails
    """
    # Check if PDF has been uploaded
    if not app.state.pdf_filename:
        return TopicSuggestionsResponse(suggestions=[], has_pdf=False)
    
    # Check if PDF has been processed
    if app.state.vector_db is None:
        raise HTTPException(status_code=400, detail="PDF not processed yet. Please re-upload the PDF.")
    
    try:
        logger.info("🔍 Generating topic suggestions from PDF content")
        
        # Sample up to 5 random chunks from the vector database for topic analysis
        all_chunks = list(app.state.vector_db.vectors.keys())
        sample_size = min(5, len(all_chunks))
        
        if sample_size == 0:
            return TopicSuggestionsResponse(suggestions=[], has_pdf=True)
        
        # Get a representative sample of chunks
        import random
        random.seed(42)  # For consistent results
        sample_chunks = random.sample(all_chunks, sample_size)
        sample_text = "\n\n".join(sample_chunks[:3])  # Use first 3 for analysis
        
        # Create prompt for topic suggestion
        suggestion_prompt = f"""Based on the following content from a PDF document, suggest exactly 2 specific, interesting questions that a user might want to ask about this document. 

Make the questions:
- Specific and actionable
- Diverse in scope (covering different aspects/topics)
- Natural and conversational
- Focused on key information that seems important

Content sample:
{sample_text}

Respond with ONLY a numbered list of exactly 2 questions, nothing else:"""

        logger.info("🤖 Generating topic suggestions using OpenAI")
        
        # Set OpenAI API key
        os.environ["OPENAI_API_KEY"] = api_key
        
        # Generate suggestions using ChatOpenAI
        chat_model = ChatOpenAI(model_name="gpt-4o-mini")
        response = chat_model.run([{"role": "user", "content": suggestion_prompt}])
        
        # Parse the response to extract individual questions
        suggestions = []
        for line in response.split('\n'):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith('-') or line.startswith('•')):
                # Remove numbering and clean up
                clean_question = line
                # Remove common prefixes
                for prefix in ['1.', '2.', '-', '•']:
                    if clean_question.startswith(prefix):
                        clean_question = clean_question[len(prefix):].strip()
                        break
                if clean_question and len(clean_question) > 10:  # Ensure it's a real question
                    suggestions.append(clean_question)
        
        # Limit to 2 suggestions maximum
        suggestions = suggestions[:2]
        
        logger.info(f"✅ Generated {len(suggestions)} topic suggestions")
        
        return TopicSuggestionsResponse(suggestions=suggestions, has_pdf=True)
        
    except Exception as e:
        logger.error(f"❌ Error generating topic suggestions: {str(e)}")
        # Return empty suggestions rather than failing completely
        return TopicSuggestionsResponse(suggestions=[], has_pdf=True)


@app.get("/api/health")
async def health_check():
    """Legacy health check endpoint for compatibility."""
    return {"status": "ok"}


# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
