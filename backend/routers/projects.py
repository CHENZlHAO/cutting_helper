from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from backend.database import get_db
from backend.models.project import Project
from backend.models.schemas import ProjectCreate, ProjectUpdate, ProjectOut, ClipReorder

router = APIRouter()


async def _get_project_with_clips(project_id: int, db: AsyncSession) -> Optional[Project]:
    result = await db.execute(
        select(Project).options(selectinload(Project.clips)).where(Project.id == project_id)
    )
    return result.unique().scalar_one_or_none()


@router.get("", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).options(selectinload(Project.clips)).order_by(Project.updated_at.desc())
    )
    return result.unique().scalars().all()


@router.post("", response_model=ProjectOut)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(name=data.name)
    db.add(project)
    await db.commit()
    return await _get_project_with_clips(project.id, db)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await _get_project_with_clips(project_id, db)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: int, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if data.name is not None:
        project.name = data.name
    await db.commit()
    return await _get_project_with_clips(project.id, db)


@router.delete("/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    await db.delete(project)
    await db.commit()
    return {"message": "deleted"}


@router.put("/{project_id}/clips/reorder")
async def reorder_clips(project_id: int, data: ClipReorder, db: AsyncSession = Depends(get_db)):
    from backend.models.project import VideoClip
    result = await db.execute(select(VideoClip).where(VideoClip.project_id == project_id))
    clips = {c.id: c for c in result.scalars().all()}
    for i, cid in enumerate(data.clip_ids):
        if cid in clips:
            clips[cid].order_index = i
    await db.commit()
    return {"message": "reordered"}


@router.get("/{project_id}/validate")
async def validate_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Validate each pipeline step for a project and return correctness status."""
    from pathlib import Path
    from backend.models.project import VideoClip, Transition
    from backend.config import settings

    project = await _get_project_with_clips(project_id, db)
    if not project:
        raise HTTPException(404, "Project not found")

    clips = project.clips
    result = await db.execute(
        select(Transition).where(Transition.project_id == project_id)
    )
    transitions = result.scalars().all()

    steps: dict[str, dict] = {
        "clips": {"label": "已添加视频片段", "ok": len(clips) > 0, "detail": f"{len(clips)} 个片段"},
        "extract_frames": {"label": "帧提取", "ok": True, "detail": ""},
        "ai_describe": {"label": "AI 描述", "ok": True, "detail": ""},
        "ai_ordering": {"label": "AI 排序", "ok": False, "detail": "尚未生成排序"},
        "generate_transitions": {"label": "转场生成", "ok": False, "detail": "尚未生成转场"},
        "concatenate": {"label": "视频导出", "ok": False, "detail": "尚未导出视频"},
    }

    # Validate frames: each clip should have at least one frame file on disk
    frame_count = 0
    for c in clips:
        has_frame = False
        for fp in (c.first_frames or []) + (c.last_frames or []):
            if Path(fp).exists():
                has_frame = True
                break
        if has_frame:
            frame_count += 1
    if len(clips) > 0 and frame_count >= len(clips):
        steps["extract_frames"] = {"label": "帧提取", "ok": True, "detail": f"{frame_count}/{len(clips)} 个片段有帧"}
    elif len(clips) > 0:
        steps["extract_frames"] = {"label": "帧提取", "ok": False, "detail": f"仅 {frame_count}/{len(clips)} 个片段有帧"}
    else:
        steps["extract_frames"] = {"label": "帧提取", "ok": False, "detail": "无片段"}

    # Validate AI descriptions: each clip should have non-empty description
    described = sum(1 for c in clips if c.ai_description and c.ai_description.strip())
    if len(clips) > 0 and described == len(clips):
        steps["ai_describe"] = {"label": "AI 描述", "ok": True, "detail": f"{described}/{len(clips)} 个片段已完成"}
    elif len(clips) > 0:
        steps["ai_describe"] = {"label": "AI 描述", "ok": False, "detail": f"仅 {described}/{len(clips)} 个片段有描述"}
    else:
        steps["ai_describe"] = {"label": "AI 描述", "ok": False, "detail": "无片段"}

    # Validate ordering: check if clips are reordered and ordering exists
    if len(clips) > 1:
        # Check if clips have been reordered from their insertion order
        clip_ids = sorted([c.id for c in clips])
        current_order = [c.id for c in sorted(clips, key=lambda x: x.order_index)]
        if current_order != clip_ids:
            steps["ai_ordering"] = {"label": "AI 排序", "ok": True, "detail": f"已按推荐顺序排列 {len(clips)} 个片段"}
        else:
            steps["ai_ordering"] = {"label": "AI 排序", "ok": False, "detail": "片段尚未排序"}
    elif len(clips) == 1:
        steps["ai_ordering"] = {"label": "AI 排序", "ok": True, "detail": "仅一个片段，无需排序"}

    # Validate transitions: check transition records exist (both AI and crossfade count)
    expected_count = max(0, len(clips) - 1)
    ai_transitions = [t for t in transitions if t.video_path and Path(t.video_path).exists()]
    valid_transitions = len(transitions)  # crossfade transitions are valid even without video files
    if expected_count > 0 and valid_transitions >= expected_count:
        ttype = "AI" if ai_transitions else "交叉淡入淡出"
        steps["generate_transitions"] = {"label": "转场生成", "ok": True, "detail": f"{valid_transitions} 个转场已生成 ({ttype})"}
    elif expected_count > 0:
        steps["generate_transitions"] = {"label": "转场生成", "ok": False, "detail": f"仅 {valid_transitions}/{expected_count} 个转场"}
    else:
        steps["generate_transitions"] = {"label": "转场生成", "ok": False, "detail": "无转场需要生成" if len(clips) <= 1 else "尚未生成"}

    # Validate concatenation: check export file exists
    if project.export_path and Path(project.export_path).exists():
        fsize = Path(project.export_path).stat().st_size
        steps["concatenate"] = {"label": "视频导出", "ok": True, "detail": f"已导出 ({_fmt_size(fsize)})"}
    else:
        steps["concatenate"] = {"label": "视频导出", "ok": False, "detail": "尚未导出"}

    all_ok = all(s["ok"] for s in steps.values())
    return {"all_ok": all_ok, "steps": steps}


def _fmt_size(size: int) -> str:
    if size >= 1_000_000_000:
        return f"{size / 1_000_000_000:.1f} GB"
    if size >= 1_000_000:
        return f"{size / 1_000_000:.1f} MB"
    if size >= 1_000:
        return f"{size / 1_000:.1f} KB"
    return f"{size} B"
