from typing import Optional
from sqlalchemy import Integer, String, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(String(4096), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class VideoModelProvider(Base):
    __tablename__ = "video_model_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(String(4096), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    max_duration: Mapped[int] = mapped_column(Integer, default=10)


class DoubaoConfig(Base):
    __tablename__ = "doubao_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chrome_profile_path: Mapped[str] = mapped_column(String(1024), default="")
    headless: Mapped[bool] = mapped_column(Boolean, default=True)
