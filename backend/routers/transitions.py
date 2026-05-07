from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database import get_db
from backend.models.project import Project, VideoClip, Transition
from backend.models.ai_config import VideoModelProvider
from backend.models.schemas import GenerateTransitionsRequest, TransitionOut
from backend.services.video_model_service import VideoModelService
from backend.services.kling_service import KlingService
from backend.services.websocket_manager import ws_manager
from backend.config import settings

router = APIRouter()


@router.post("/generate")
async def generate_transitions(
    project_id: int,
    data: GenerateTransitionsRequest,
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
    if len(clips) < 2:
        raise HTTPException(400, "Need at least 2 clips")

    if data.transition_type == "ai":
        # Try Kling AI first
        kling = KlingService(
            access_key=settings.kling_access_key,
            secret_key=settings.kling_secret_key,
            model=settings.kling_model,
        )

        transitions = []
        for i in range(len(clips) - 1):
            prev = clips[i]
            nxt = clips[i + 1]
            last_frame = Path(prev.last_frames[-1]) if prev.last_frames else None
            first_frame = Path(nxt.first_frames[0]) if nxt.first_frames else None
            if not last_frame or not first_frame:
                transitions.append(None)
                continue

            await ws_manager.send_ai_progress("transition", "generating",
                f"Kling generating transition {i+1}/{len(clips)-1}")
            try:
                out_path = await kling.generate_transition(
                    last_frame, first_frame,
                    prompt=data.prompt_override,
                    duration=int(data.duration),
                )
                if out_path and out_path.exists():
                    t = Transition(
                        project_id=project_id,
                        from_clip_id=prev.id,
                        to_clip_id=nxt.id,
                        transition_type="ai_generated",
                        video_path=str(out_path),
                        duration=data.duration,
                    )
                    db.add(t)
                    transitions.append(t)
                    continue
            except Exception as e:
                await ws_manager.send_error(f"Kling transition {i+1} failed: {str(e)}")

            # Fallback: try OpenAI-compatible video model if configured
            vm_result = await db.execute(select(VideoModelProvider).where(VideoModelProvider.is_default == True))
            vm_provider = vm_result.scalar_one_or_none()
            if not vm_provider:
                vm_result = await db.execute(select(VideoModelProvider))
                vm_provider = vm_result.scalars().first()

            if vm_provider:
                try:
                    vm_service = VideoModelService()
                    out_path = await vm_service.generate_transition(
                        vm_provider, last_frame, first_frame,
                        prompt_template=data.prompt_override,
                        duration=data.duration,
                    )
                    if out_path and out_path.exists():
                        t = Transition(
                            project_id=project_id,
                            from_clip_id=prev.id,
                            to_clip_id=nxt.id,
                            transition_type="ai_generated",
                            video_path=str(out_path),
                            duration=data.duration,
                        )
                        db.add(t)
                        transitions.append(t)
                        continue
                except Exception:
                    pass

            transitions.append(None)

        await db.commit()
        return {"transitions": len([t for t in transitions if t])}

    elif data.transition_type == "crossfade":
        from backend.services.ffmpeg_service import FFmpegService
        ffmpeg = FFmpegService()
        for i in range(len(clips) - 1):
            prev_clip = clips[i]
            next_clip = clips[i + 1]
            # Use last frame of prev clip and first frame of next clip
            last_frame = Path(prev_clip.last_frames[-1]) if prev_clip.last_frames else None
            first_frame = Path(next_clip.first_frames[0]) if next_clip.first_frames else None

            transition_path = None
            if last_frame and first_frame and last_frame.exists() and first_frame.exists():
                out_path = settings.data_dir / "transitions" / str(project_id) / f"crossfade_{prev_clip.id}_{next_clip.id}.mp4"
                try:
                    await ffmpeg.generate_crossfade_video(last_frame, first_frame, out_path, data.duration)
                    if out_path.exists():
                        transition_path = str(out_path)
                except Exception:
                    pass

            t = Transition(
                project_id=project_id,
                from_clip_id=prev_clip.id,
                to_clip_id=next_clip.id,
                transition_type="crossfade",
                video_path=transition_path,
                duration=data.duration,
            )
            db.add(t)
        await db.commit()
        return {"transitions": len(clips) - 1}

    return {"transitions": 0}


@router.get("/project/{project_id}", response_model=list[TransitionOut])
async def list_transitions(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Transition).where(Transition.project_id == project_id))
    return result.scalars().all()
