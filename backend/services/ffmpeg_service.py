import asyncio
import json
import re
from pathlib import Path
from typing import Literal, Optional


class FFmpegService:
    async def probe_video(self, video_path: Path) -> dict:
        """Run ffprobe, return metadata dict."""
        cmd = [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", "-show_streams", str(video_path)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {stderr.decode()}")

        info = json.loads(stdout)
        video_stream = None
        for s in info.get("streams", []):
            if s.get("codec_type") == "video":
                video_stream = s
                break

        fmt = info.get("format", {})
        return {
            "duration": float(fmt.get("duration", 0)),
            "width": int(video_stream["width"]) if video_stream else 0,
            "height": int(video_stream["height"]) if video_stream else 0,
            "codec": video_stream.get("codec_name", "") if video_stream else "",
            "fps": self._parse_fps(video_stream) if video_stream else 0,
            "bitrate": int(fmt.get("bit_rate", 0)),
        }

    def _parse_fps(self, stream: dict) -> float:
        r = stream.get("r_frame_rate", "0/1")
        if "/" in r:
            parts = r.split("/")
            return float(parts[0]) / float(parts[1])
        return float(r)

    async def extract_frames(
        self,
        video_path: Path,
        output_dir: Path,
        position: Literal["first", "last", "both"] = "both",
        num_frames: int = 3,
        progress_callback=None,
    ) -> list[Path]:
        """Extract first and/or last N frames from video."""
        output_dir.mkdir(parents=True, exist_ok=True)
        stem = video_path.stem
        results = []

        if position in ("first", "both"):
            for i in range(num_frames):
                out = output_dir / f"{stem}_first_{i:03d}.png"
                # seek to i seconds and grab one frame
                cmd = [
                    "ffmpeg", "-y", "-ss", str(i * 0.5), "-i", str(video_path),
                    "-vframes", "1", "-q:v", "2", str(out)
                ]
                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await proc.communicate()
                if out.exists():
                    results.append(out)

        if position in ("last", "both"):
            duration = (await self.probe_video(video_path))["duration"]
            for i in range(num_frames):
                out = output_dir / f"{stem}_last_{i:03d}.png"
                seek_time = max(0, duration - (num_frames - i) * 0.5)
                cmd = [
                    "ffmpeg", "-y", "-ss", str(seek_time), "-i", str(video_path),
                    "-vframes", "1", "-q:v", "2", str(out)
                ]
                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await proc.communicate()
                if out.exists():
                    results.append(out)

        if progress_callback:
            await progress_callback(100)

        return results

    async def generate_thumbnail(self, video_path: Path, output_path: Path, time_offset: float = 1.0) -> Path:
        cmd = [
            "ffmpeg", "-y", "-ss", str(time_offset), "-i", str(video_path),
            "-vframes", "1", "-q:v", "2", str(output_path)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        return output_path

    async def concatenate_videos(
        self,
        segments: list[dict],
        output_path: Path,
        bgm_path: Optional[Path] = None,
        progress_callback=None,
    ) -> Path:
        """
        Concatenate video segments with transitions.
        Handles mixed resolutions by scaling all inputs to 1280x720.
        Optionally mixes background music from bgm_path.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        has_bgm = bgm_path is not None and bgm_path.exists()

        # Build filter complex to scale each input then concat with explicit durations
        filter_parts = []
        for i, seg in enumerate(segments):
            dur = seg.get("duration", 0)
            filter_parts.append(
                f"[{i}:v]scale=1280:720:force_original_aspect_ratio=decrease,"
                f"pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
                + (f",trim=duration={dur}" if dur > 0 else "")
                + f"[v{i}]"
            )

        concat_inputs = "".join(f"[v{i}]" for i in range(len(segments)))
        filter_parts.append(f"{concat_inputs}concat=n={len(segments)}:v=1:a=0[outv]")

        input_args = []
        for seg in segments:
            input_args.extend(["-i", seg["path"]])

        if has_bgm:
            # Add BGM input with infinite loop; -shortest will trim to video length
            input_args.extend(["-stream_loop", "-1", "-i", str(bgm_path)])

        cmd = [
            "ffmpeg", "-y",
            *input_args,
            "-filter_complex", ";".join(filter_parts),
            "-map", "[outv]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-pix_fmt", "yuv420p",
        ]

        if has_bgm:
            bgm_input_idx = len(segments)
            cmd.extend([
                "-map", f"{bgm_input_idx}:a",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
            ])
        else:
            cmd.append("-an")

        cmd.append(str(output_path))

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"Concatenation failed: {stderr.decode()[-500:]}")

        if progress_callback:
            await progress_callback(100)

        return output_path

    async def generate_crossfade_video(
        self,
        from_frame: Path,
        to_frame: Path,
        output_path: Path,
        duration: float = 2.0,
    ) -> Path:
        """Generate a crossfade transition video between two frame images.
        Handles different resolutions by scaling to a common 1280x720."""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        # Scale both frames to a common resolution, then crossfade
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", str(from_frame),
            "-loop", "1", "-i", str(to_frame),
            "-filter_complex",
            (
                "[0]scale=1280:720:force_original_aspect_ratio=decrease,"
                "pad=1280:720:(ow-iw)/2:(oh-ih)/2:black[fa];"
                "[1]scale=1280:720:force_original_aspect_ratio=decrease,"
                "pad=1280:720:(ow-iw)/2:(oh-ih)/2:black[fb];"
                f"[fa][fb]blend=all_expr='A*(1-min(T/{duration},1))+B*min(T/{duration},1)'[out]"
            ),
            "-map", "[out]",
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
            "-pix_fmt", "yuv420p",
            str(output_path)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        return output_path

    async def apply_filter(self, input_path: Path, output_path: Path, filter_complex: str) -> Path:
        cmd = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-vf", filter_complex,
            "-c:a", "copy", str(output_path)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        return output_path
