from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database import get_db
from backend.models.project import Project, VideoClip, Transition
from backend.models.schemas import ConcatenateRequest
from backend.services.ffmpeg_service import FFmpegService
from backend.services.websocket_manager import ws_manager
from backend.config import settings

router = APIRouter()
ffmpeg = FFmpegService()


@router.post("/project/{project_id}")
async def concatenate_project(
    project_id: int,
    data: ConcatenateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    clips_result = await db.execute(
        select(VideoClip).where(VideoClip.project_id == project_id).order_by(VideoClip.order_index)
    )
    clips = clips_result.scalars().all()

    transitions_result = await db.execute(
        select(Transition).where(Transition.project_id == project_id).order_by(Transition.id)
    )
    transitions = {t.from_clip_id: t for t in transitions_result.scalars().all()}

    segments = []
    for clip in clips:
        segments.append({"path": clip.source_path, "duration": clip.duration})
        trans = transitions.get(clip.id)
        if trans and trans.video_path:
            segments.append({"path": trans.video_path, "duration": trans.duration})

    output_path = settings.data_dir / "exports" / str(project_id) / f"{data.output_name}.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bgm = Path(data.bgm_path) if data.bgm_path else None
    await ws_manager.send_progress("concatenate", 0)
    try:
        await ffmpeg.concatenate_videos(
            segments, output_path,
            bgm_path=bgm,
            progress_callback=lambda p: ws_manager.send_progress("concatenate", p)
        )
    except Exception as e:
        await ws_manager.send_error(f"Concatenation failed: {str(e)}")
        raise HTTPException(500, f"Concatenation failed: {str(e)}")

    project.export_path = str(output_path)
    await db.commit()
    await ws_manager.send_progress("concatenate", 100)
    return {"output_path": str(output_path), "filename": f"{data.output_name}.mp4"}


@router.get("/project/{project_id}/download/{filename}")
async def download_export(project_id: int, filename: str):
    filepath = settings.data_dir / "exports" / str(project_id) / filename
    if not filepath.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(filepath, media_type="video/mp4", filename=filename)
