from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database import get_db
from backend.models.project import Project, VideoClip
from backend.models.ai_config import LLMProvider, VideoModelProvider
from backend.models.schemas import DescribeFramesRequest, AIOrderingResult
from backend.services.ai_service import AIService
from backend.services.doubao_service import DoubaoService
from backend.services.gemini_service import GeminiService
from backend.services.ordering_service import OrderingService
from backend.services.video_model_service import VideoModelService
from backend.services.websocket_manager import ws_manager
from backend.config import settings

router = APIRouter()


def _decrypt(encrypted: str) -> str:
    from backend.services.crypto_service import CryptoService
    return CryptoService().decrypt(encrypted)


@router.post("/describe-frames")
async def describe_frames(data: DescribeFramesRequest, db: AsyncSession = Depends(get_db)):
    # Resolve LLM provider once for both llm and fallback cases
    llm_provider = None
    if data.provider in ("llm", "doubao", "gemini"):
        llm_result = await db.execute(select(LLMProvider).where(LLMProvider.is_default == True))
        llm_provider = llm_result.scalar_one_or_none()
        if not llm_provider:
            llm_result = await db.execute(select(LLMProvider))
            llm_provider = llm_result.scalars().first()

    results = {}
    for cid in data.clip_ids:
        result = await db.execute(select(VideoClip).where(VideoClip.id == cid))
        clip = result.scalar_one_or_none()
        if not clip:
            continue

        if data.provider == "doubao":
            service = DoubaoService()
            frames = (clip.first_frames or []) + (clip.last_frames or [])
            if frames:
                try:
                    descriptions = await service.describe_images(
                        [Path(f) for f in frames],
                        progress_callback=lambda i, s: ws_manager.send_doubao_progress(cid, i, s)
                    )
                    combined = "\n---\n".join(descriptions)
                    clip.ai_description = combined
                    results[cid] = combined
                except Exception:
                    if llm_provider:
                        ai_svc = AIService(llm_provider)
                        desc = await ai_svc.describe_clip_text(
                            clip.filename, clip.duration, clip.width, clip.height)
                        clip.ai_description = desc
                        results[cid] = desc
        elif data.provider == "gemini":
            gemini = GeminiService(api_key=settings.gemini_api_key, model=settings.gemini_model)
            frames = (clip.first_frames or []) + (clip.last_frames or [])
            if frames:
                try:
                    await ws_manager.send_ai_progress("describe", "thinking", "Gemini analyzing frames...")
                    descriptions = await gemini.describe_images(
                        [Path(f) for f in frames],
                        progress_callback=lambda i, s: ws_manager.send_doubao_progress(cid, i, s)
                    )
                    # Filter out error messages from Gemini
                    valid_descriptions = [d for d in descriptions if d and not d.startswith("[Gemini error")]
                    if not valid_descriptions:
                        raise ValueError("All Gemini descriptions failed")
                    combined = "\n---\n".join(valid_descriptions)
                    clip.ai_description = combined
                    results[cid] = combined
                except Exception:
                    if llm_provider:
                        ai_svc = AIService(llm_provider)
                        desc = await ai_svc.describe_clip_text(
                            clip.filename, clip.duration, clip.width, clip.height)
                        clip.ai_description = desc
                        results[cid] = desc
        else:
            # LLM Vision with text fallback
            if not llm_provider:
                raise HTTPException(400, "No LLM provider configured")

            service = AIService(llm_provider)
            frames = (clip.first_frames or []) + (clip.last_frames or [])

            # Probe first frame to check if model supports vision
            desc = frames and await service.describe_image(Path(frames[0]))
            if desc:
                # Vision works — describe all remaining frames
                descriptions = [desc]
                for i, fp in enumerate(frames[1:], start=2):
                    await ws_manager.send_ai_progress("describe", "thinking", f"Analyzing frame {i}/{len(frames)}")
                    d = await service.describe_image(Path(fp))
                    if d:
                        descriptions.append(d)
                combined = "\n---\n".join(descriptions)
                clip.ai_description = combined
                results[cid] = combined
            else:
                # Vision unsupported — use text analysis from metadata
                await ws_manager.send_ai_progress("describe", "thinking", "Vision unsupported, using text analysis")
                desc = await service.describe_clip_text(
                    clip.filename, clip.duration, clip.width, clip.height)
                clip.ai_description = desc
                results[cid] = desc

    await db.commit()
    return {"descriptions": results}


@router.post("/ordering")
async def ai_ordering(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    clips = await db.execute(
        select(VideoClip).where(VideoClip.project_id == project_id).order_by(VideoClip.order_index)
    )
    clips = clips.scalars().all()

    llm_result = await db.execute(select(LLMProvider).where(LLMProvider.is_default == True))
    llm_provider = llm_result.scalar_one_or_none()
    if not llm_provider:
        llm_result = await db.execute(select(LLMProvider))
        llm_provider = llm_result.scalars().first()
    if not llm_provider:
        raise HTTPException(400, "No LLM provider configured")

    await ws_manager.send_ai_progress("ordering", "thinking", "Analyzing clip descriptions...")
    service = OrderingService()
    ai_svc = AIService(llm_provider)
    order, reasoning = await service.compute_optimal_order(clips, ai_svc)
    await ws_manager.send_ai_progress("ordering", "done", "Ordering complete")
    return {"order": order, "reasoning": reasoning}
