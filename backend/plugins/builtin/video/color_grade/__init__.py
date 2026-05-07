import asyncio
from pathlib import Path
from backend.plugins.base import VideoStylizationPlugin, PluginManifest


class ColorGradePlugin(VideoStylizationPlugin):
    manifest = PluginManifest(
        name="cinematic_color_grade",
        version="1.0.0",
        description="Apply cinematic color grading to video clips",
        author="builtin",
        plugin_type="video_stylization",
        parameters_schema={
            "type": "object",
            "properties": {
                "contrast": {"type": "number", "minimum": 0.5, "maximum": 2.0, "default": 1.1},
                "saturation": {"type": "number", "minimum": 0, "maximum": 2.0, "default": 1.0},
                "brightness": {"type": "number", "minimum": -0.5, "maximum": 0.5, "default": 0.0},
            },
        },
    )

    async def process(self, input_path: Path, output_path: Path, params: dict) -> Path:
        contrast = params.get("contrast", 1.1)
        saturation = params.get("saturation", 1.0)
        brightness = params.get("brightness", 0.0)
        filter_chain = f"eq=contrast={contrast}:saturation={saturation}:brightness={brightness}"
        cmd = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-vf", filter_chain,
            "-c:a", "copy", str(output_path),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return output_path
