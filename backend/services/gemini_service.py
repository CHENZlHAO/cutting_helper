from __future__ import annotations
import logging
import base64
from pathlib import Path
import httpx

logger = logging.getLogger(__name__)


class GeminiService:
    """Call Gemini vision API for image description."""

    API_BASE = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-lite"):
        self.api_key = api_key
        self.model = model

    async def describe_image(self, image_path: Path, prompt: str | None = None) -> str:
        if not image_path.exists():
            return ""

        try:
            with open(image_path, "rb") as f:
                image_data = base64.b64encode(f.read()).decode()
        except Exception as e:
            logger.warning(f"Failed to read image {image_path}: {e}")
            return ""

        default_prompt = (
            "请详细描述这张图片中出现的所有事物（人物、物体、场景、颜色、光线等），"
            "以及整个画面的内容。输出格式：\n"
            "事物：列出画面中出现的关键事物\n"
            "描述：描述整个画面的内容"
        )

        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt or default_prompt},
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": image_data,
                        }
                    },
                ]
            }]
        }

        url = f"{self.API_BASE}/models/{self.model}:generateContent?key={self.api_key}"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    error_msg = ""
                    try:
                        err = resp.json().get("error", {})
                        error_msg = err.get("message", resp.text)[:300]
                    except Exception:
                        error_msg = resp.text[:300]
                    logger.warning(f"Gemini API error {resp.status_code}: {error_msg}")
                    return f"[Gemini error: {error_msg}]"
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    for part in parts:
                        if "text" in part:
                            return part["text"]
                # Check for prompt feedback (safety filters)
                feedback = data.get("promptFeedback", {})
                if feedback.get("blockReason"):
                    return f"[Gemini blocked: {feedback.get('blockReason')}]"
                return ""
        except httpx.TimeoutException:
            logger.warning(f"Gemini API timeout for {image_path}")
            return "[Gemini error: request timeout]"
        except Exception as e:
            logger.warning(f"Gemini API exception: {e}")
            return f"[Gemini error: {e}]"

    async def describe_images(
        self,
        image_paths: list[Path],
        prompt: str | None = None,
        progress_callback=None,
    ) -> list[str]:
        descriptions = []
        for i, img_path in enumerate(image_paths):
            if progress_callback:
                await progress_callback(i, "analyzing")
            desc = await self.describe_image(img_path, prompt)
            descriptions.append(desc)
            if progress_callback:
                await progress_callback(i, "done")
        return descriptions
