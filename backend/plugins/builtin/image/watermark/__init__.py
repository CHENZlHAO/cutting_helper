import asyncio
from pathlib import Path
from backend.plugins.base import ImageStylizationPlugin, PluginManifest


class WatermarkPlugin(ImageStylizationPlugin):
    manifest = PluginManifest(
        name="image_watermark",
        version="1.0.0",
        description="Add text or image watermark to images",
        author="builtin",
        plugin_type="image_stylization",
        parameters_schema={
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Watermark text"},
                "position": {"type": "string", "enum": ["top-left", "top-right", "bottom-left", "bottom-right", "center"], "default": "bottom-right"},
                "font_size": {"type": "number", "default": 24},
                "opacity": {"type": "number", "minimum": 0, "maximum": 1, "default": 0.5},
            },
        },
    )

    async def process(self, input_path: Path, output_path: Path, params: dict) -> Path:
        text = params.get("text", "Watermark")
        position = params.get("position", "bottom-right")
        font_size = params.get("font_size", 24)
        opacity = params.get("opacity", 0.5)

        # Map position to x:y alignment
        pos_map = {
            "top-left": "10:10",
            "top-right": "W-tw-10:10",
            "bottom-left": "10:H-th-10",
            "bottom-right": "W-tw-10:H-th-10",
            "center": "(W-tw)/2:(H-th)/2",
        }
        pos_expr = pos_map.get(position, "W-tw-10:H-th-10")

        filter_chain = (
            f"drawtext=text='{text}':"
            f"x={pos_expr}:"
            f"fontsize={font_size}:"
            f"fontcolor=white@{opacity}:"
            f"box=1:boxcolor=black@0.3:boxborderw=5"
        )
        cmd = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-vf", filter_chain,
            str(output_path),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return output_path
