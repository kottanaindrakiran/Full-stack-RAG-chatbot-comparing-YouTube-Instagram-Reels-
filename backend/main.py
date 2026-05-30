import os
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv

try:
    from backend.models import IngestRequest, IngestResponse, ChatRequest
    from backend.ingest import ingest_videos
    from backend.rag import stream_rag_chat
except ModuleNotFoundError:
    from models import IngestRequest, IngestResponse, ChatRequest
    from ingest import ingest_videos
    from rag import stream_rag_chat

# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(
    title="VideoRAG Backend",
    description="FastAPI backend for comparing YouTube videos and Instagram Reels using RAG"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    """Root endpoint welcoming users or directing to API documentation."""
    return {"message": "Welcome to VideoRAG Backend API! Access API documentation at /docs"}

@app.get("/health")
def health_check():
    """Health check endpoint to verify backend status."""
    return {"status": "ok", "message": "VideoRAG backend is healthy"}

@app.post("/ingest", response_model=IngestResponse)
async def ingest_endpoint(request: IngestRequest):
    """
    Ingests YouTube video (A) and Instagram Reel (B).
    Downloads metadata, extracts/transcribes transcripts, and saves to vector DB.
    """
    try:
        print(f"Received ingest request: URL A = {request.url_a}, URL B = {request.url_b}")
        meta_a, meta_b = ingest_videos(request.url_a, request.url_b)
        return IngestResponse(
            success=True,
            video_a=meta_a,
            video_b=meta_b
        )
    except Exception as e:
        print(f"Ingestion endpoint error: {e}")
        return IngestResponse(
            success=False,
            error=str(e)
        )

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Chat endpoint running LangGraph RAG query.
    Streams output chunks using Server-Sent Events (SSE).
    """
    async def event_generator():
        try:
            history_dicts = [{"role": m.role, "content": m.content} for m in request.history]
            async for token in stream_rag_chat(request.message, history_dicts):
                # SSE specification: data should be prefix with 'data: ' and end with '\n\n'
                # EventSourceResponse handles the SSE format wrapping automatically 
                # when yielding dicts like {"data": ...} or simple text strings
                yield {"data": token}
        except Exception as e:
            print(f"Streaming error: {e}")
            yield {"data": f"[ERROR: {str(e)}]"}

    return EventSourceResponse(event_generator())

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting VideoRAG backend on port {port}...")
    try:
        import backend
        uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
    except ModuleNotFoundError:
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
