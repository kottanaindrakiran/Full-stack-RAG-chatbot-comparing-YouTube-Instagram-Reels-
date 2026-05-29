import os
import re
import tempfile
import yt_dlp
from typing import Optional, Tuple, Dict, Any
from youtube_transcript_api import YouTubeTranscriptApi
from openai import OpenAI
import chromadb
from langchain.text_splitter import RecursiveCharacterTextSplitter
from dotenv import load_dotenv

# Import Pydantic models
from backend.models import VideoMetadata

# Load environment variables
load_dotenv()

# Setup OpenAI client
openai_client = OpenAI()

def format_duration(seconds: int) -> str:
    """Formats duration in seconds to MM:SS or HH:MM:SS format."""
    if not seconds or seconds < 0:
        return "0:00"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    else:
        return f"{m}:{s:02d}"

def get_youtube_video_id(url: str) -> Optional[str]:
    """Extracts YouTube video ID from various YouTube URL formats."""
    pattern = r'(?:v=|\/v\/|embed\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    return match.group(1) if match else None

def get_video_metadata_ytdlp(url: str, platform: str) -> Dict[str, Any]:
    """Uses yt-dlp to extract video metadata."""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': False
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            return info
        except Exception as e:
            print(f"Error extracting metadata with yt-dlp for {url}: {e}")
            return {}

def extract_youtube_transcript(video_id: str) -> str:
    """Fetches YouTube transcript using youtube-transcript-api."""
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join([t['text'] for t in transcript_list])
    except Exception as e:
        print(f"Error fetching YouTube transcript for {video_id}: {e}")
        return ""

def download_and_transcribe_instagram(url: str, title: str, description: str) -> str:
    """Downloads Instagram Reel audio and transcribes it using Whisper."""
    audio_path = None
    try:
        # Import whisper inside function to avoid PyTorch loading overhead if not needed
        import whisper
        
        temp_dir = tempfile.gettempdir()
        out_base = os.path.join(temp_dir, f"insta_audio_{os.getpid()}")
        
        # Audio download options
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': out_base + '.%(ext)s',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,
            'no_warnings': True,
        }
        
        print(f"Downloading Instagram Reel audio to {out_base}...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
        audio_path = out_base + ".mp3"
        
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file was not created: {audio_path}")
            
        print("Transcribing Instagram Reel audio with Whisper (tiny)...")
        model = whisper.load_model("tiny")
        result = model.transcribe(audio_path)
        transcript = result.get("text", "").strip()
        print(f"Transcription completed. Characters: {len(transcript)}")
        
        return transcript
        
    except Exception as e:
        print(f"Error transcribing Instagram Reel: {e}")
        # Fallback to description/title
        fallback = f"{title}. {description}".strip()
        if not fallback:
            fallback = "No transcript available. This is a fallback description for the Instagram Reel."
        print("Falling back to metadata description.")
        return fallback
    finally:
        # Clean up audio file
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"Cleaned up temporary audio file: {audio_path}")
            except Exception as cleanup_err:
                print(f"Error cleaning up audio file: {cleanup_err}")

def build_metadata(info: Dict[str, Any], url: str, video_id: str, platform: str) -> VideoMetadata:
    """Constructs VideoMetadata Pydantic model from yt-dlp info dictionary."""
    # Standardize views, likes, comments, duration, creator, follower count
    views = int(info.get('view_count') or 0)
    likes = int(info.get('like_count') or 0)
    comments = int(info.get('comment_count') or 0)
    duration = int(info.get('duration') or 0)
    
    # Extract creator name
    creator = (
        info.get('uploader') or 
        info.get('creator') or 
        info.get('channel') or 
        info.get('uploader_id') or 
        "Unknown"
    )
    
    # Extract follower count
    followers = int(
        info.get('channel_follower_count') or 
        info.get('uploader_follower_count') or 
        info.get('subscriber_count') or 
        0
    )
    
    # Compute engagement rate: (likes + comments) / views * 100
    engagement_rate = 0.0
    if views > 0:
        engagement_rate = round(((likes + comments) / views) * 100, 2)
        
    title = info.get('title') or info.get('description') or f"Video {video_id}"
    if len(title) > 200:
        title = title[:197] + "..."
        
    return VideoMetadata(
        video_id=video_id,
        url=url,
        platform=platform,
        title=title,
        views=views,
        likes=likes,
        comments=comments,
        duration=duration,
        duration_formatted=format_duration(duration),
        creator=creator,
        followers=followers,
        engagement_rate=engagement_rate
    )

def ingest_videos(url_a: str, url_b: str) -> Tuple[VideoMetadata, VideoMetadata]:
    """Main ingestion orchestrator. Fetches data, splits transcripts, and updates ChromaDB."""
    print(f"Ingesting Video A (YouTube): {url_a}")
    yt_info = get_video_metadata_ytdlp(url_a, "YouTube")
    meta_a = build_metadata(yt_info, url_a, "A", "YouTube")
    
    # Fetch transcript for Video A
    yt_vid_id = get_youtube_video_id(url_a)
    transcript_a = ""
    if yt_vid_id:
        transcript_a = extract_youtube_transcript(yt_vid_id)
    if not transcript_a:
        transcript_a = yt_info.get('description') or yt_info.get('title') or "No transcript available for YouTube video A."
        
    print(f"Ingesting Video B (Instagram Reel): {url_b}")
    ig_info = get_video_metadata_ytdlp(url_b, "Instagram")
    meta_b = build_metadata(ig_info, url_b, "B", "Instagram")
    
    # Download and transcribe for Video B
    description_b = ig_info.get('description') or ""
    title_b = ig_info.get('title') or ""
    transcript_b = download_and_transcribe_instagram(url_b, title_b, description_b)
    
    # Chunking transcripts
    splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        chunk_size=500,
        chunk_overlap=50
    )
    
    chunks_a = splitter.split_text(transcript_a) if transcript_a else ["No transcript content available for Video A."]
    chunks_b = splitter.split_text(transcript_b) if transcript_b else ["No transcript content available for Video B."]
    
    # Clear ChromaDB and store embeddings
    chroma_path = os.path.join(os.path.dirname(__file__), "chroma_db")
    print(f"Initializing ChromaDB client at {chroma_path}...")
    chroma_client = chromadb.PersistentClient(path=chroma_path)
    
    # Delete collection if it exists to ensure a clean slate
    collection_name = "video_comparison"
    try:
        chroma_client.delete_collection(collection_name)
        print("Cleared existing ChromaDB collection.")
    except Exception:
        pass
        
    collection = chroma_client.create_collection(collection_name)
    print("Created fresh ChromaDB collection.")
    
    # Embed and add chunks for Video A
    print(f"Embedding {len(chunks_a)} chunks for Video A...")
    emb_a_resp = openai_client.embeddings.create(input=chunks_a, model="text-embedding-3-small")
    embeddings_a = [x.embedding for x in emb_a_resp.data]
    ids_a = [f"A_chunk_{i}" for i in range(len(chunks_a))]
    metadatas_a = [
        {"video_id": "A", "chunk_id": i, "title": meta_a.title, "url": meta_a.url} 
        for i in range(len(chunks_a))
    ]
    collection.add(
        ids=ids_a,
        documents=chunks_a,
        embeddings=embeddings_a,
        metadatas=metadatas_a
    )
    
    # Embed and add chunks for Video B
    print(f"Embedding {len(chunks_b)} chunks for Video B...")
    emb_b_resp = openai_client.embeddings.create(input=chunks_b, model="text-embedding-3-small")
    embeddings_b = [x.embedding for x in emb_b_resp.data]
    ids_b = [f"B_chunk_{i}" for i in range(len(chunks_b))]
    metadatas_b = [
        {"video_id": "B", "chunk_id": i, "title": meta_b.title, "url": meta_b.url} 
        for i in range(len(chunks_b))
    ]
    collection.add(
        ids=ids_b,
        documents=chunks_b,
        embeddings=embeddings_b,
        metadatas=metadatas_b
    )
    
    print("Ingestion pipeline successfully completed!")
    return meta_a, meta_b
