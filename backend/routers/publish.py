from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database import get_db
from backend.models.publish import PlatformAccount, PublishTask
from backend.models.schemas import PublishRequest, PublishTaskOut, PlatformAccountOut
from backend.services.publish_service import PublishService
from backend.services.websocket_manager import ws_manager

router = APIRouter()


@router.get("/accounts", response_model=list[PlatformAccountOut])
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlatformAccount))
    return result.scalars().all()


@router.post("/accounts/login")
async def login_account(platform: str, account_name: str, db: AsyncSession = Depends(get_db)):
    service = PublishService()
    try:
        ok, msg = await service.login(platform, account_name)
        result = await db.execute(
            select(PlatformAccount).where(
                PlatformAccount.platform == platform,
                PlatformAccount.account_name == account_name,
            )
        )
        account = result.scalar_one_or_none()
        if not account:
            account = PlatformAccount(platform=platform, account_name=account_name)
            db.add(account)
        account.is_logged_in = ok
        await db.commit()
        return {"success": ok, "message": msg}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/accounts/{account_id}/check")
async def check_login(account_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlatformAccount).where(PlatformAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")
    service = PublishService()
    ok, msg = await service.check_login(account.platform, account.account_name)
    account.is_logged_in = ok
    await db.commit()
    return {"is_logged_in": ok, "message": msg}


@router.post("/upload")
async def upload_video(data: PublishRequest, db: AsyncSession = Depends(get_db)):
    from backend.models.project import Project
    result = await db.execute(select(Project).where(Project.id == data.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.export_path:
        raise HTTPException(400, "Project has no exported video")

    service = PublishService()
    tasks = []
    for plat in data.platforms:
        task = PublishTask(
            project_id=data.project_id,
            platform=plat.platform,
            account_name=plat.account_name,
            title=plat.title,
            description=plat.description,
            tags=plat.tags,
            video_path=project.export_path,
            status="uploading",
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)

        await ws_manager.send_publish_progress(plat.platform, task.id, "uploading", 0)
        try:
            ok, url, err = await service.upload_video(
                plat.platform, plat.account_name, project.export_path,
                plat.title or "", plat.description or "", plat.tags or [],
                schedule=plat.schedule,
            )
            task.status = "done" if ok else "failed"
            task.result_url = url
            task.error_message = err
            await ws_manager.send_publish_progress(plat.platform, task.id, task.status, 100 if ok else 0)
        except Exception as e:
            task.status = "failed"
            task.error_message = str(e)
            await ws_manager.send_publish_progress(plat.platform, task.id, "failed", 0)
        await db.commit()
        tasks.append(task)

    return {"tasks": len(tasks)}


@router.get("/tasks", response_model=list[PublishTaskOut])
async def list_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PublishTask).order_by(PublishTask.created_at.desc()))
    return result.scalars().all()


@router.get("/tasks/{task_id}", response_model=PublishTaskOut)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PublishTask).where(PublishTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    return task
