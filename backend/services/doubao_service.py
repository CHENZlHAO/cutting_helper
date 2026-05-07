from __future__ import annotations
import asyncio
import os
from pathlib import Path


class DoubaoService:
    """
    Automates Doubao (豆包) web interface using Playwright with
    persistent browser context to reuse existing login cookies.
    """

    def __init__(self, user_data_dir: str | None = None):
        # Default to Chrome default profile
        self.user_data_dir = user_data_dir or os.path.expanduser(
            "~/Library/Application Support/Google/Chrome"
        )

    async def describe_images(
        self,
        image_paths: list[Path],
        prompt: str | None = None,
        progress_callback=None,
    ) -> list[str]:
        """
        Launch Playwright with persistent context, navigate to Doubao,
        upload images, and extract AI descriptions.
        """
        descriptions = []
        prompt_text = prompt or (
            "请详细描述这张图片中出现的所有事物（人物、物体、场景等），"
            "以及整个画面的内容。包括颜色、光线、构图等信息。"
        )

        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                # Use persistent context to reuse existing Chrome profile/cookies
                browser = await p.chromium.launch_persistent_context(
                    user_data_dir=self.user_data_dir,
                    headless=True,
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                    ],
                    channel=None,  # use default chromium
                )

                page = browser.pages[0] if browser.pages else await browser.new_page()

                # Navigate to Doubao chat
                await page.goto("https://www.doubao.com/chat/", wait_until="domcontentloaded")
                await asyncio.sleep(2)

                for i, img_path in enumerate(image_paths):
                    if not img_path.exists():
                        descriptions.append("")
                        continue

                    if progress_callback:
                        await progress_callback(i, "uploading")

                    # Upload image via file input
                    try:
                        # Look for file upload input
                        file_input = await page.wait_for_selector(
                            'input[type="file"]', timeout=10000
                        )
                        await file_input.set_input_files(str(img_path))
                        await asyncio.sleep(1)

                        # Type prompt
                        textarea = await page.wait_for_selector(
                            'textarea[placeholder], div[contenteditable="true"]',
                            timeout=10000,
                        )
                        if textarea:
                            await textarea.fill(prompt_text)
                            await asyncio.sleep(0.5)

                        # Click send button
                        send_btn = await page.wait_for_selector(
                            'button[type="submit"], .send-btn, [aria-label*="send" i], [aria-label*="发送" i]',
                            timeout=5000,
                        )
                        if send_btn:
                            await send_btn.click()
                            await asyncio.sleep(3)

                        if progress_callback:
                            await progress_callback(i, "waiting_response")

                        # Wait for response and extract text
                        await asyncio.sleep(5)
                        response_text = await self._extract_response(page)
                        descriptions.append(response_text)

                    except Exception as e:
                        descriptions.append(f"[Doubao error: {str(e)}]")

                    if progress_callback:
                        await progress_callback(i, "done")

                await browser.close()

        except ImportError:
            descriptions = [
                "Playwright not available - please install: pip install playwright && playwright install chromium"
                for _ in image_paths
            ]
        except Exception as e:
            descriptions = [f"[Browser error: {str(e)}]" for _ in image_paths]

        return descriptions

    async def _extract_response(self, page) -> str:
        """Extract the response text from the Doubao chat page."""
        try:
            # Try various selectors for the AI response
            selectors = [
                ".message-bot .message-content",
                ".chat-message.assistant .content",
                '[class*="assistant"] [class*="content"]',
                '[class*="bot"] [class*="text"]',
                ".markdown-body",
            ]
            for sel in selectors:
                elements = await page.query_selector_all(sel)
                if elements:
                    texts = []
                    for el in elements:
                        text = await el.inner_text()
                        if text and len(text) > 20:
                            texts.append(text)
                    if texts:
                        return "\n".join(texts[-2:])  # Last 2 messages

            return await page.inner_text("body") or "No response text found"
        except Exception as e:
            return f"[Extract error: {str(e)}]"
