from __future__ import annotations
import asyncio
import os
from pathlib import Path
from backend.config import settings

SUPPORTED_PLATFORMS = [
    "douyin", "bilibili", "xiaohongshu", "kuaishou",
    "wechat_channels", "baijiahao", "tiktok"
]


class PublishService:
    """
    Wraps social-auto-upload CLI. Runs it as a subprocess for each platform.
    Falls back gracefully if social-auto-upload is not yet installed.
    """

    async def _have_sau(self) -> bool:
        sau_dir = settings.sau_base_dir
        return sau_dir.exists() and (sau_dir / "sau_cli.py").exists()

    async def _run_sau(self, *args: str, cwd: str | None = None) -> tuple[int, str, str]:
        """Run sau CLI command and return (returncode, stdout, stderr)."""
        sau_dir = settings.sau_base_dir
        cmd = ["python3", str(sau_dir / "sau_cli.py")] + list(args)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=cwd or str(sau_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        return proc.returncode or 0, stdout.decode(), stderr.decode()

    async def login(self, platform: str, account_name: str) -> tuple[bool, str]:
        if not await self._have_sau():
            return False, "social-auto-upload is not installed yet"

        try:
            rc, out, err = await self._run_sau(platform, "login", "--account", account_name)
            if rc == 0:
                return True, out.strip()
            return False, err.strip() or out.strip()
        except Exception as e:
            return False, str(e)

    async def check_login(self, platform: str, account_name: str) -> tuple[bool, str]:
        if not await self._have_sau():
            return False, "social-auto-upload is not installed yet"

        try:
            rc, out, err = await self._run_sau(platform, "check", "--account", account_name)
            return rc == 0, out.strip() or err.strip()
        except Exception as e:
            return False, str(e)

    async def upload_video(
        self,
        platform: str,
        account_name: str,
        video_path: str,
        title: str,
        description: str,
        tags: list[str],
        schedule: str | None = None,
    ) -> tuple[bool, str | None, str | None]:
        """
        Upload video to a platform.
        Returns (success, result_url, error_message).
        """
        if not await self._have_sau():
            # Return mock success for now — user needs to install social-auto-upload
            return False, None, "social-auto-upload is not installed. Please clone the repository."

        args = [
            platform, "upload-video",
            "--account", account_name,
            "--file", str(video_path),
            "--title", title or "",
            "--desc", description or "",
            "--tags", ",".join(tags or []),
        ]
        if schedule:
            args.extend(["--schedule", schedule])

        try:
            rc, out, err = await self._run_sau(*args)
            if rc == 0:
                # Try to extract URL from output
                url = None
                for line in out.split("\n"):
                    if "http" in line.lower() and "://" in line:
                        url = line.strip()
                        break
                return True, url, None
            return False, None, err.strip() or out.strip()
        except Exception as e:
            return False, None, str(e)
