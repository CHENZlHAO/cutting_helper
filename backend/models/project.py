from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    export_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    clips: Mapped[list["VideoClip"]] = relationship(
        "VideoClip", back_populates="project",
        order_by="VideoClip.order_index", cascade="all, delete-orphan"
    )
    transitions: Mapped[list["Transition"]] = relationship(
        "Transition", back_populates="project", cascade="all, delete-orphan"
    )


class VideoClip(Base):
    __tablename__ = "video_clips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)
    source_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    filename: Mapped[str] = mapped_column(String(255))
    duration: Mapped[float] = mapped_column(Float, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    first_frames: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    last_frames: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ai_description: Mapped[Optional[str]] = mapped_column(String(4096), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="clips")
    transitions_from: Mapped[list["Transition"]] = relationship(
        "Transition", foreign_keys="Transition.from_clip_id", cascade="all, delete-orphan"
    )
    transitions_to: Mapped[list["Transition"]] = relationship(
        "Transition", foreign_keys="Transition.to_clip_id", cascade="all, delete-orphan"
    )


class Transition(Base):
    __tablename__ = "transitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)
    from_clip_id: Mapped[int] = mapped_column(Integer, ForeignKey("video_clips.id"), nullable=False)
    to_clip_id: Mapped[int] = mapped_column(Integer, ForeignKey("video_clips.id"), nullable=False)
    transition_type: Mapped[str] = mapped_column(String(50), default="crossfade")
    video_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    prompt_used: Mapped[Optional[str]] = mapped_column(String(4096), nullable=True)
    duration: Mapped[float] = mapped_column(Float, default=2.0)

    project: Mapped["Project"] = relationship("Project", back_populates="transitions")
