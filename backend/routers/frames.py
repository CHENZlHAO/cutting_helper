from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database import get_db
from backend.models.project import Project, VideoClip
from backend.models.schemas import ExtractFramesRequest
from backend.services.ffmpeg_service import FFmpegService
from backend.services.websocket_manager import ws_manager
from backend.config import settings

router = APIRouter()
ffmpeg = FFmpegService()


@router.post("/extract")
async def extract_frames(data: ExtractFramesRequest, db: AsyncSession = Depends(get_db)):
    results = {}
    for cid in data.clip_ids:
        result = await db.execute(select(VideoClip).where(VideoClip.id == cid))
        clip = result.scalar_one_or_none()
        if not clip:
            continue

        output_dir = settings.data_dir / "frames" / str(clip.project_id) / str(cid)
        output_dir.mkdir(parents=True, exist_ok=True)

        paths = await ffmpeg.extract_frames(
            Path(clip.source_path), output_dir, data.position, data.num_frames,
            progress_callback=lambda p: ws_manager.send_progress("extract_frames", p, clip_id=cid)
        )

        first = [str(p) for p in paths if "first" in p.stem]
        last = [str(p) for p in paths if "last" in p.stem]
        if first:
            clip.first_frames = first
        if last:
            clip.last_frames = last
        results[cid] = {"first_frames": first, "last_frames": last}

    await db.commit()
    return {"frames": results}


@router.get("/file")
async def get_frame_file(path: str = Query(...)):
    """Serve a frame image file by path. Only serves files within data/frames."""
    file_path = Path(path)
    frames_dir = settings.data_dir / "frames"
    resolved = file_path.resolve()
    if not str(resolved).startswith(str(frames_dir.resolve())):
        raise HTTPException(403, "Access denied")
    if not resolved.exists():
        raise HTTPException(404, "Frame file not found")
    return FileResponse(resolved, media_type="image/png")


@router.get("/project/{project_id}")
async def get_project_frames(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VideoClip).where(VideoClip.project_id == project_id))
    clips = result.scalars().all()
    return {
        c.id: {"first_frames": c.first_frames, "last_frames": c.last_frames, "ai_description": c.ai_description}
        for c in clips
    }
