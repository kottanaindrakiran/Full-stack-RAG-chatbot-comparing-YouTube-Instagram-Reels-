from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class IngestRequest(BaseModel):
    url_a: str = Field(..., description="YouTube video URL (Video A)")
    url_b: str = Field(..., description="Instagram Reel URL (Video B)")

class VideoMetadata(BaseModel):
    video_id: str = Field(..., description="'A' or 'B'")
    url: str = Field(..., description="Original video URL")
    platform: str = Field(..., description="'YouTube' or 'Instagram'")
    title: str = Field(..., description="Title or description of the video")
    views: int = Field(0, description="View count")
    likes: int = Field(0, description="Like count")
    comments: int = Field(0, description="Comment count")
    duration: int = Field(0, description="Duration in seconds")
    duration_formatted: str = Field("0:00", description="Formatted duration e.g. 18:42 or 0:58")
    creator: str = Field("Unknown", description="Creator or channel name")
    followers: int = Field(0, description="Follower or subscriber count")
    engagement_rate: float = Field(0.0, description="Engagement rate in percent: (likes + comments) / views * 100")

class IngestResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    video_a: Optional[VideoMetadata] = None
    video_b: Optional[VideoMetadata] = None

class MessageParam(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Text content of the message")

class ChatRequest(BaseModel):
    message: str = Field(..., description="Current user query")
    history: List[MessageParam] = Field(default_factory=list, description="Conversation history")
