from __future__ import annotations
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
from pathlib import Path
import httpx

logger = logging.getLogger(__name__)

API_BASE = "https://api.klingai.com"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _generate_jwt(access_key: str, secret_key: str) -> str:
    """Generate a JWT token signed with HS256."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": access_key,
        "exp": now + 3600,
        "nbf": now - 5,
        "iat": now - 10,
        "jti": f"idt{int(time.time() * 1000)}",
    }
    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    sig = hmac.new(secret_key.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = _b64url(sig)
    return f"{signing_input}.{sig_b64}"


class KlingService:
    """Call Kling AI video generation API using JWT auth."""

    def __init__(self, access_key: str, secret_key: str, model: str = "kling-v1-6"):
        self.access_key = access_key
        self.secret_key = secret_key
        self.model = model

    def _headers(self) -> dict:
        token = _generate_jwt(self.access_key, self.secret_key)
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def image_to_video(
        self,
        image_path: Path,
        prompt: str,
        duration: int = 5,
        image_tail_path: Path | None = None,
    ) -> dict | None:
        """
        Submit an image-to-video task and poll until completion.
        Returns the task result dict with video URLs, or None on failure.
        """
        if not image_path.exists():
            logger.warning(f"Image not found: {image_path}")
            return None

        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()

        image_tail_b64 = None
        if image_tail_path and image_tail_path.exists():
            with open(image_tail_path, "rb") as f:
                image_tail_b64 = base64.b64encode(f.read()).decode()

        payload = {
            "model_name": self.model,
            "image": image_b64,
            "prompt": prompt,
            "duration": duration,
            "mode": "std",
        }
        if image_tail_b64:
            payload["image_tail"] = image_tail_b64

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{API_BASE}/v1/videos/image2video",
                    headers=self._headers(),
                    json=payload,
                )
                if resp.status_code != 200:
                    logger.warning(f"Kling create task failed: {resp.status_code} {resp.text[:300]}")
                    return None
                data = resp.json()
                if data.get("code") != 0:
                    logger.warning(f"Kling API error: {data.get('message', data)}")
                    return None
                task_id = data["data"]["task_id"]
        except Exception as e:
            logger.warning(f"Kling API exception: {e}")
            return None

        # Poll for completion
        for _ in range(120):  # max 10 minutes (120 * 5s)
            await asyncio.sleep(5)
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(
                        f"{API_BASE}/v1/videos/image2video/{task_id}",
                        headers=self._headers(),
                    )
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    if data.get("code") != 0:
                        continue
                    status = data["data"]["task_status"]
                    if status == "succeed":
                        return data["data"].get("task_result", {})
                    elif status == "failed":
                        logger.warning(f"Kling task failed: {data['data'].get('task_status_msg', '')}")
                        return None
            except Exception:
                continue

        logger.warning(f"Kling task {task_id} timed out")
        return None

    async def generate_transition(
        self,
        from_frame: Path,
        to_frame: Path,
        prompt: str | None = None,
        duration: int = 5,
    ) -> Path | None:
        """
        Generate a transition video between two frames using Kling AI.
        Downloads the result and returns the local file path.
        """
        default_prompt = (
            "Create a seamless, cinematic video transition from the first image to the second image. "
            "Smooth morphing, natural motion, visually appealing."
        )
        result = await self.image_to_video(
            image_path=from_frame,
            prompt=prompt or default_prompt,
            duration=duration,
            image_tail_path=to_frame,
        )
        if not result:
            return None

        videos = result.get("videos", [])
        if not videos:
            return None

        video_url = videos[0].get("url")
        if not video_url:
            return None

        # Download the generated video
        try:
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                resp = await client.get(video_url)
                if resp.status_code == 200:
                    output_dir = Path("data/transitions")
                    output_dir.mkdir(parents=True, exist_ok=True)
                    output_path = output_dir / f"kling_{from_frame.stem}_{to_frame.stem}.mp4"
                    output_path.write_bytes(resp.content)
                    return output_path
        except Exception as e:
            logger.warning(f"Failed to download Kling video: {e}")

        return None
