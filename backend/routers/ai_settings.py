from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database import get_db
from backend.models.ai_config import LLMProvider, VideoModelProvider, DoubaoConfig
from backend.models.schemas import (
    LLMProviderCreate, LLMProviderUpdate, LLMProviderOut,
    VideoModelProviderCreate, VideoModelProviderUpdate, VideoModelProviderOut,
    DoubaoConfigUpdate, DoubaoConfigOut,
)
from backend.services.crypto_service import CryptoService

router = APIRouter()
crypto = CryptoService()

# --- LLM Providers ---

@router.get("/llm", response_model=list[LLMProviderOut])
async def list_llm_providers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMProvider))
    return result.scalars().all()


@router.post("/llm", response_model=LLMProviderOut)
async def create_llm_provider(data: LLMProviderCreate, db: AsyncSession = Depends(get_db)):
    if data.is_default:
        await _clear_llm_default(db)
    provider = LLMProvider(
        name=data.name,
        base_url=data.base_url,
        api_key_encrypted=crypto.encrypt(data.api_key),
        model_name=data.model_name,
        is_default=data.is_default,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return provider


@router.put("/llm/{provider_id}", response_model=LLMProviderOut)
async def update_llm_provider(provider_id: int, data: LLMProviderUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "Provider not found")
    if data.is_default:
        await _clear_llm_default(db)
    for field in ("name", "base_url", "model_name", "is_default"):
        if (v := getattr(data, field, None)) is not None:
            setattr(provider, field, v)
    if data.api_key:
        provider.api_key_encrypted = crypto.encrypt(data.api_key)
    await db.commit()
    await db.refresh(provider)
    return provider


@router.delete("/llm/{provider_id}")
async def delete_llm_provider(provider_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "Provider not found")
    await db.delete(provider)
    await db.commit()
    return {"message": "deleted"}


@router.post("/llm/test")
async def test_llm(provider_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "Provider not found")
    from backend.services.ai_service import AIService
    service = AIService(provider)
    ok, msg = await service.test_connection()
    return {"success": ok, "message": msg}


# --- Video Model Providers ---

@router.get("/video-model", response_model=list[VideoModelProviderOut])
async def list_vm_providers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VideoModelProvider))
    return result.scalars().all()


@router.post("/video-model", response_model=VideoModelProviderOut)
async def create_vm_provider(data: VideoModelProviderCreate, db: AsyncSession = Depends(get_db)):
    if data.is_default:
        await _clear_vm_default(db)
    provider = VideoModelProvider(
        name=data.name,
        base_url=data.base_url,
        api_key_encrypted=crypto.encrypt(data.api_key),
        model_name=data.model_name,
        is_default=data.is_default,
        max_duration=data.max_duration,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return provider


@router.put("/video-model/{provider_id}", response_model=VideoModelProviderOut)
async def update_vm_provider(provider_id: int, data: VideoModelProviderUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VideoModelProvider).where(VideoModelProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "Provider not found")
    if data.is_default:
        await _clear_vm_default(db)
    for field in ("name", "base_url", "model_name", "is_default", "max_duration"):
        if (v := getattr(data, field, None)) is not None:
            setattr(provider, field, v)
    if data.api_key:
        provider.api_key_encrypted = crypto.encrypt(data.api_key)
    await db.commit()
    await db.refresh(provider)
    return provider


@router.delete("/video-model/{provider_id}")
async def delete_vm_provider(provider_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VideoModelProvider).where(VideoModelProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "Provider not found")
    await db.delete(provider)
    await db.commit()
    return {"message": "deleted"}


@router.post("/video-model/test")
async def test_vm(provider_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VideoModelProvider).where(VideoModelProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "Provider not found")
    from backend.services.video_model_service import VideoModelService
    service = VideoModelService()
    ok, msg = await service.test_connection(provider)
    return {"success": ok, "message": msg}


# --- Doubao Config ---

@router.get("/doubao", response_model=DoubaoConfigOut)
async def get_doubao_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DoubaoConfig))
    config = result.scalars().first()
    if not config:
        config = DoubaoConfig(chrome_profile_path="", headless=True)
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


@router.put("/doubao", response_model=DoubaoConfigOut)
async def update_doubao_config(data: DoubaoConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DoubaoConfig))
    config = result.scalars().first()
    if not config:
        config = DoubaoConfig()
        db.add(config)
    if data.chrome_profile_path is not None:
        config.chrome_profile_path = data.chrome_profile_path
    if data.headless is not None:
        config.headless = data.headless
    await db.commit()
    await db.refresh(config)
    return config


# --- Helpers ---

async def _clear_llm_default(db: AsyncSession):
    result = await db.execute(select(LLMProvider).where(LLMProvider.is_default == True))
    for p in result.scalars().all():
        p.is_default = False


async def _clear_vm_default(db: AsyncSession):
    result = await db.execute(select(VideoModelProvider).where(VideoModelProvider.is_default == True))
    for p in result.scalars().all():
        p.is_default = False
