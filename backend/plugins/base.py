from abc import ABC, abstractmethod
from pathlib import Path
from pydantic import BaseModel


class PluginManifest(BaseModel):
    name: str
    version: str
    description: str
    author: str
    plugin_type: str  # "video_stylization" | "image_stylization"
    parameters_schema: dict = {}


class VideoStylizationPlugin(ABC):
    manifest: PluginManifest

    @abstractmethod
    async def process(self, input_path: Path, output_path: Path, params: dict) -> Path:
        """Apply stylization to video. Returns output path."""
        ...


class ImageStylizationPlugin(ABC):
    manifest: PluginManifest

    @abstractmethod
    async def process(self, input_path: Path, output_path: Path, params: dict) -> Path:
        """Apply stylization to image. Returns output path."""
        ...
