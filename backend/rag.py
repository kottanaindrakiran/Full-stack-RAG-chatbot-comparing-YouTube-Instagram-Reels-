import os
from typing import TypedDict, List, Dict, Any, AsyncGenerator
import chromadb
from openai import OpenAI
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup OpenAI client for embeddings
openai_client = OpenAI()

# Initialize ChromaDB client
chroma_path = os.path.join(os.path.dirname(__file__), "chroma_db")
chroma_client = chromadb.PersistentClient(path=chroma_path)

# LangGraph State definition
class RAGState(TypedDict):
    query: str
    history: List[Dict[str, str]]
    context: str
    response: str

def retrieve_node(state: RAGState) -> Dict[str, Any]:
    """Retrieves relevant transcript chunks from ChromaDB for both videos."""
    query = state["query"]
    print(f"Retrieving context for query: {query}")
    
    try:
        # Embed the search query
        emb_resp = openai_client.embeddings.create(
            input=[query],
            model="text-embedding-3-small"
        )
        query_embedding = emb_resp.data[0].embedding
        
        # Search ChromaDB
        collection = chroma_client.get_collection("video_comparison")
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=6
        )
        
        # Format the retrieved chunks for LLM context
        context_parts = []
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        
        print(f"Retrieved {len(documents)} chunks from ChromaDB.")
        for i, (doc, meta) in enumerate(zip(documents, metadatas)):
            video_id = meta.get("video_id", "Unknown")
            chunk_id = meta.get("chunk_id", i)
            context_parts.append(
                f"Source: Video {video_id} · chunk {chunk_id}\nContent: {doc}\n"
            )
            
        context = "\n".join(context_parts)
    except Exception as e:
        print(f"Error in ChromaDB retrieval: {e}")
        context = "No relevant video transcript context found. Please ensure videos are analyzed first."
        
    return {"context": context}

def generate_node(state: RAGState) -> Dict[str, Any]:
    """Generates standard RAG response (non-streaming)."""
    query = state["query"]
    history = state["history"]
    context = state["context"]
    
    system_text = (
        "You are an expert video analyst comparing two videos: Video A (YouTube) and Video B (Instagram Reel).\n"
        "Answer the user's questions about the videos using only the retrieved transcript context below.\n\n"
        "For every piece of information you use, you MUST cite its source using the exact format: [Video A · chunk N] or [Video B · chunk N] based on the source of the context.\n"
        "If you are discussing differences or similarities, make sure to explicitly contrast both videos.\n\n"
        f"Retrieved Context:\n{context}\n\n"
        "Maintain a helpful, analytical tone. Keep your responses concise."
    )
    
    messages = [SystemMessage(content=system_text)]
    for msg in history:
        if msg.get("role") == "user":
            messages.append(HumanMessage(content=msg.get("content", "")))
        else:
            messages.append(AIMessage(content=msg.get("content", "")))
    messages.append(HumanMessage(content=query))
    
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    res = llm.invoke(messages)
    return {"response": res.content}

# Define LangGraph workflow
workflow = StateGraph(RAGState)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)

workflow.set_entry_point("retrieve")
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)

rag_graph = workflow.compile()

async def stream_rag_chat(query: str, history: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
    """Orchestrates RAG context retrieval and yields streaming SSE tokens."""
    # 1. Run retrieval node via RAG state
    state = RAGState(query=query, history=history, context="", response="")
    retrieved_state = retrieve_node(state)
    context = retrieved_state["context"]
    
    # 2. Build conversational system prompt and user chat history
    system_text = (
        "You are an expert video analyst comparing two videos: Video A (YouTube) and Video B (Instagram Reel).\n"
        "Answer the user's questions about the videos using only the retrieved transcript context below.\n\n"
        "For every piece of information you use, you MUST cite its source using the exact format: [Video A · chunk N] or [Video B · chunk N] based on the source of the context.\n"
        "If you are discussing differences or similarities, make sure to explicitly contrast both videos.\n\n"
        f"Retrieved Context:\n{context}\n\n"
        "Maintain a helpful, analytical tone. Keep your responses concise."
    )
    
    messages = [SystemMessage(content=system_text)]
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        else:
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=query))
    
    # 3. Stream output chunks using ChatOpenAI
    print("Initiating streaming response from GPT-4o-mini...")
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    async for chunk in llm.astream(messages):
        if chunk.content:
            yield chunk.content
