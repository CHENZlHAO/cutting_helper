import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from backend.database import get_db
from backend.models.project import Project, VideoClip
from backend.models.schemas import VideoInfoOut
from backend.services.ffmpeg_service import FFmpegService

router = APIRouter()
ffmpeg = FFmpegService()


@router.get("", response_model=list[VideoInfoOut])
async def list_videos(db: AsyncSession = Depends(get_db)):
    """List all videos across all projects (deduplicated by source_path)."""
    result = await db.execute(select(VideoClip))
    clips = result.scalars().all()
    seen = set()
    unique = []
    for c in sorted(clips, key=lambda x: x.id, reverse=True):
        if c.source_path not in seen:
            seen.add(c.source_path)
            unique.append(VideoInfoOut(
                id=c.id, source_path=c.source_path, filename=c.filename,
                duration=c.duration, width=c.width, height=c.height,
                file_size=c.file_size, thumbnail=None
            ))
    return unique


@router.post("/scan")
async def scan_folders(folder_paths: list[str], db: AsyncSession = Depends(get_db)):
    """Scan folders for video files and return metadata."""
    video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v"}
    results = []
    for folder in folder_paths:
        p = Path(folder)
        if not p.exists():
            continue
        for f in p.rglob("*"):
            if f.suffix.lower() in video_exts and not f.name.startswith("._"):
                try:
                    meta = await ffmpeg.probe_video(f)
                    results.append({
                        "source_path": str(f),
                        "filename": f.name,
                        "duration": meta["duration"],
                        "width": meta["width"],
                        "height": meta["height"],
                        "file_size": f.stat().st_size,
                    })
                except Exception as e:
                    results.append({
                        "source_path": str(f),
                        "filename": f.name,
                        "duration": 0,
                        "width": 0,
                        "height": 0,
                        "file_size": f.stat().st_size,
                        "error": str(e),
                    })
    return {"videos": results, "count": len(results)}


@router.post("/{project_id}/clips")
async def add_clips_to_project(
    project_id: int,
    source_paths: list[str],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    max_order_result = await db.execute(
        select(VideoClip.order_index).where(VideoClip.project_id == project_id).order_by(VideoClip.order_index.desc())
    )
    max_order = max_order_result.scalar() or -1

    clips = []
    for i, sp in enumerate(source_paths):
        p = Path(sp)
        meta = await ffmpeg.probe_video(p)
        clip = VideoClip(
            project_id=project_id,
            source_path=str(p),
            filename=p.name,
            duration=meta["duration"],
            width=meta["width"],
            height=meta["height"],
            file_size=p.stat().st_size,
            order_index=max_order + 1 + i,
        )
        db.add(clip)
        clips.append(clip)

    await db.commit()
    return {"added": len(clips)}


@router.delete("/{project_id}/clips/{clip_id}")
async def remove_clip(project_id: int, clip_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VideoClip).where(VideoClip.id == clip_id, VideoClip.project_id == project_id)
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(404, "Clip not found")
    await db.delete(clip)
    await db.commit()
    return {"message": "removed"}


@router.get("/{clip_id}/thumbnail")
async def get_thumbnail(clip_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VideoClip).where(VideoClip.id == clip_id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(404, "Clip not found")
    from backend.config import settings
    thumb_path = settings.data_dir / "thumbnails" / f"{clip_id}.jpg"
    if not thumb_path.exists():
        await ffmpeg.generate_thumbnail(Path(clip.source_path), thumb_path)
    from fastapi.responses import FileResponse
    return FileResponse(thumb_path, media_type="image/jpeg")
