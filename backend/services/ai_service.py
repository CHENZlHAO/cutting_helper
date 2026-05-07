from __future__ import annotations
import asyncio
import base64
from pathlib import Path
from openai import OpenAI
from backend.models.ai_config import LLMProvider
from backend.services.crypto_service import CryptoService

crypto = CryptoService()


class AIService:
    def __init__(self, provider: LLMProvider):
        api_key = crypto.decrypt(provider.api_key_encrypted)
        self.client = OpenAI(base_url=provider.base_url, api_key=api_key, timeout=120.0)
        self.model = provider.model_name

    async def chat(self, messages: list[dict], **kwargs) -> str:
        response = await asyncio.to_thread(
            self.client.chat.completions.create,
            model=self.model,
            messages=messages,
            temperature=kwargs.get("temperature", 0.7),
            max_tokens=kwargs.get("max_tokens", 4096),
            timeout=kwargs.get("timeout", 120.0),
        )
        return response.choices[0].message.content or ""

    async def describe_image(self, image_path: Path, prompt: str | None = None) -> str:
        """Use vision model to describe image content. Falls back to text-only if vision unsupported."""
        if not image_path.exists():
            return ""

        try:
            with open(image_path, "rb") as f:
                image_data = base64.b64encode(f.read()).decode()
        except Exception:
            return ""

        default_prompt = (
            "请详细描述这张图片中出现的所有事物（人物、物体、场景、颜色、光线等），"
            "以及整个画面的内容。输出格式：\n"
            "事物：列出画面中出现的关键事物\n"
            "描述：描述整个画面的内容"
        )
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt or default_prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_data}"},
                    },
                ],
            }
        ]
        try:
            return await self.chat(messages, timeout=60.0)
        except Exception:
            return ""

    async def describe_clip_text(self, filename: str, duration: float, width: int, height: int) -> str:
        """Text-only fallback: generate clip description from metadata."""
        prompt = (
            f"你是一个视频剪辑助手。请根据以下视频文件信息，推测这个视频片段可能的内容和用途：\n"
            f"- 文件名: {filename}\n"
            f"- 时长: {duration:.1f} 秒\n"
            f"- 分辨率: {width}x{height}\n\n"
            f"请输出：\n"
            f"事物：根据文件名推测视频中可能出现的关键事物\n"
            f"描述：推测这个视频片段的内容和风格"
        )
        try:
            return await self.chat(
                [{"role": "user", "content": prompt}],
                max_tokens=1024,
                timeout=30.0,
            )
        except Exception:
            return f"视频片段: {filename}, 时长 {duration:.1f}s, {width}x{height}"

    async def test_connection(self) -> tuple[bool, str]:
        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.model,
                messages=[{"role": "user", "content": "Hello"}],
                max_tokens=10,
                timeout=10.0,
            )
            return True, "Connection successful"
        except Exception as e:
            return False, str(e)
