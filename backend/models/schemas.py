from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


# --- Project ---
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ProjectUpdate(BaseModel):
    name: Optional[str] = None


class ClipReorder(BaseModel):
    clip_ids: list[int]


class VideoInfoOut(BaseModel):
    id: int
    source_path: str
    filename: str
    duration: float
    width: int
    height: int
    file_size: int
    thumbnail: Optional[str] = None

    class Config:
        from_attributes = True


class VideoClipOut(BaseModel):
    id: int
    project_id: int
    source_path: str
    filename: str
    duration: float
    width: int
    height: int
    file_size: int
    order_index: int
    first_frames: Optional[list[str]] = None
    last_frames: Optional[list[str]] = None
    ai_description: Optional[str] = None

    class Config:
        from_attributes = True


class TransitionOut(BaseModel):
    id: int
    project_id: int
    from_clip_id: int
    to_clip_id: int
    transition_type: str
    video_path: Optional[str] = None
    prompt_used: Optional[str] = None
    duration: float

    class Config:
        from_attributes = True


class ProjectOut(BaseModel):
    id: int
    name: str
    export_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    clips: list[VideoClipOut] = []

    class Config:
        from_attributes = True


# --- AI Settings ---
class LLMProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    model_name: str
    is_default: bool = False


class LLMProviderUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    is_default: Optional[bool] = None


class VideoModelProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    model_name: str
    is_default: bool = False
    max_duration: int = 10


class VideoModelProviderUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    is_default: Optional[bool] = None
    max_duration: Optional[int] = None


class LLMProviderOut(BaseModel):
    id: int
    name: str
    base_url: str
    model_name: str
    is_default: bool

    class Config:
        from_attributes = True


class VideoModelProviderOut(BaseModel):
    id: int
    name: str
    base_url: str
    model_name: str
    is_default: bool
    max_duration: int

    class Config:
        from_attributes = True


# --- Frame Extraction ---
class ExtractFramesRequest(BaseModel):
    clip_ids: list[int]
    num_frames: int = Field(default=3, ge=1, le=10)
    position: str = Field(default="both", pattern="^(first|last|both)$")


# --- AI Description ---
class DescribeFramesRequest(BaseModel):
    clip_ids: list[int]
    provider: str = Field(default="gemini", pattern="^(doubao|llm|gemini)$")


# --- Transition Generation ---
class GenerateTransitionsRequest(BaseModel):
    transition_type: str = Field(default="ai", pattern="^(ai|crossfade|none)$")
    duration: float = Field(default=2.0, ge=0.5, le=10.0)
    prompt_override: Optional[str] = None


# --- Concatenation ---
class ConcatenateRequest(BaseModel):
    output_name: str = Field(..., min_length=1)
    bgm_path: Optional[str] = None


# --- Publish ---
class PlatformUploadRequest(BaseModel):
    platform: str
    account_name: str
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    schedule: Optional[str] = None


class PublishRequest(BaseModel):
    project_id: int
    platforms: list[PlatformUploadRequest]


class PublishTaskOut(BaseModel):
    id: int
    project_id: int
    platform: str
    account_name: str
    video_path: str
    title: Optional[str]
    description: Optional[str]
    tags: Optional[list]
    status: str
    scheduled_at: Optional[datetime]
    result_url: Optional[str]
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class PlatformAccountOut(BaseModel):
    id: int
    platform: str
    account_name: str
    is_logged_in: bool

    class Config:
        from_attributes = True


# --- AI Ordering ---
class AIOrderingResult(BaseModel):
    order: list[int]
    reasoning: str


# --- Doubao Config ---
class DoubaoConfigUpdate(BaseModel):
    chrome_profile_path: Optional[str] = None
    headless: Optional[bool] = None


class DoubaoConfigOut(BaseModel):
    chrome_profile_path: str
    headless: bool

    class Config:
        from_attributes = True


# --- Generic ---
class MessageResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
    version: str
