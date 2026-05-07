from __future__ import annotations
import base64
from pathlib import Path
from openai import OpenAI
from backend.models.ai_config import VideoModelProvider
from backend.services.crypto_service import CryptoService
from backend.config import settings

crypto = CryptoService()


class VideoModelService:
    """Unified interface for video generation model APIs (OpenAI-compatible)."""

    DEFAULT_PROMPT = (
        "Create a seamless video transition between these two images. "
        "Start from the first image and smoothly morph/transition into the second image. "
        "The transition should be natural, cinematic, and visually appealing. "
        "Duration: {duration} seconds."
    )

    async def generate_transition(
        self,
        provider: VideoModelProvider,
        first_frame: Path,
        last_frame: Path,
        prompt_template: str | None = None,
        duration: float = 2.0,
    ) -> Path:
        """
        Call video model API to generate transition video from two frames.
        Works with OpenAI-compatible video generation APIs (e.g., Kling, Runway via compatible proxy).
        """
        api_key = crypto.decrypt(provider.api_key_encrypted)
        client = OpenAI(base_url=provider.base_url, api_key=api_key)

        prompt = (prompt_template or self.DEFAULT_PROMPT).format(duration=duration)

        with open(first_frame, "rb") as f:
            first_b64 = base64.b64encode(f.read()).decode()
        with open(last_frame, "rb") as f:
            last_b64 = base64.b64encode(f.read()).decode()

        try:
            response = client.chat.completions.create(
                model=provider.model_name,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{first_b64}"}},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{last_b64}"}},
                        ],
                    }
                ],
                max_tokens=1000,
            )
            # For video generation, the response may contain a URL or the video itself
            # This depends on the specific API. We provide a generic implementation.
            output_path = settings.data_dir / "transitions" / f"transition_{first_frame.stem}_{last_frame.stem}.mp4"
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # If the API returns a video URL, download it
            content = response.choices[0].message.content or ""
            if content.startswith("http"):
                import httpx
                async with httpx.AsyncClient() as http_client:
                    resp = await http_client.get(content)
                    output_path.write_bytes(resp.content)
                return output_path

            # Fallback: create a simple crossfade via FFmpeg
            from backend.services.ffmpeg_service import FFmpegService
            ffmpeg = FFmpegService()
            # Create a crossfade effect
            filter_complex = (
                f"[0]loop=-1:1:0,trim=0:{duration},setpts=PTS-STARTPTS[v0];"
                f"[1]loop=-1:1:0,trim=0:{duration},setpts=PTS-STARTPTS[v1];"
                f"[v0][v1]blend=all_expr='A*(1-min(T/{duration},1))+B*(min(T/{duration},1))'[out]"
            )
            temp0 = output_path.parent / f"_temp0_{first_frame.stem}.mp4"
            temp1 = output_path.parent / f"_temp1_{last_frame.stem}.mp4"
            # Convert images to short videos
            import asyncio
            for img, temp in [(first_frame, temp0), (last_frame, temp1)]:
                cmd = [
                    "ffmpeg", "-y", "-loop", "1", "-i", str(img),
                    "-c:v", "libx264", "-t", str(duration), "-pix_fmt", "yuv420p", str(temp)
                ]
                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await proc.communicate()

            cmd = [
                "ffmpeg", "-y",
                "-i", str(temp0), "-i", str(temp1),
                "-filter_complex", filter_complex,
                "-t", str(duration), str(output_path)
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            await proc.communicate()

            # Clean up temp files
            temp0.unlink(missing_ok=True)
            temp1.unlink(missing_ok=True)

            return output_path

        except Exception as e:
            # Fallback to crossfade on any error
            from backend.services.ffmpeg_service import FFmpegService
            ffmpeg = FFmpegService()
            output_path = settings.data_dir / "transitions" / f"transition_{first_frame.stem}_{last_frame.stem}.mp4"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            await self._generate_crossfade_fallback(ffmpeg, first_frame, last_frame, output_path, duration)
            return output_path

    async def _generate_crossfade_fallback(
        self, ffmpeg, first_frame: Path, last_frame: Path,
        output_path: Path, duration: float
    ):
        """Generate a simple crossfade transition between two images."""
        import asyncio
        temp0 = output_path.parent / f"_tf0_{first_frame.stem}.mp4"
        temp1 = output_path.parent / f"_tf1_{last_frame.stem}.mp4"
        for img, temp in [(first_frame, temp0), (last_frame, temp1)]:
            cmd = [
                "ffmpeg", "-y", "-loop", "1", "-i", str(img),
                "-c:v", "libx264", "-t", str(duration), "-pix_fmt", "yuv420p", str(temp)
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            await proc.communicate()

        filter_complex = (
            f"[0]loop=-1:1:0,trim=0:{duration},setpts=PTS-STARTPTS[v0];"
            f"[1]loop=-1:1:0,trim=0:{duration},setpts=PTS-STARTPTS[v1];"
            f"[v0][v1]blend=all_expr='A*(1-min(T/{duration},1))+B*(min(T/{duration},1))'[out]"
        )
        cmd = [
            "ffmpeg", "-y", "-i", str(temp0), "-i", str(temp1),
            "-filter_complex", filter_complex,
            "-t", str(duration), str(output_path)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        temp0.unlink(missing_ok=True)
        temp1.unlink(missing_ok=True)

    async def test_connection(self, provider: VideoModelProvider) -> tuple[bool, str]:
        try:
            api_key = crypto.decrypt(provider.api_key_encrypted)
            client = OpenAI(base_url=provider.base_url, api_key=api_key)
            # Simple models list check
            client.models.list()
            return True, "Connection successful"
        except Exception as e:
            return False, str(e)
