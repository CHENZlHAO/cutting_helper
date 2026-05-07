import json
import re
from backend.models.project import VideoClip
from backend.services.ai_service import AIService


class OrderingService:
    PROMPT_TEMPLATE = """你是一名专业视频剪辑师。以下是{N}段视频片段的描述。
每段片段有一个ID（从0到{N_minus_1}），以及对内容的描述。

{clip_descriptions}

请确定这些视频片段的最佳排列顺序，以创建引人入胜的叙事。
考虑：视觉流畅性、主题连贯性、情感弧线、景别变化、色彩搭配。

请以如下JSON格式返回结果（仅JSON，不要有其他内容）：
{{
  "order": [3, 0, 5, 1, 2, 4],
  "reasoning": "解释你的剪辑决策..."
}}"""

    async def compute_optimal_order(
        self, clips: list[VideoClip], ai_service: AIService
    ) -> tuple[list[int], str]:
        descriptions = []
        for i, clip in enumerate(clips):
            desc = clip.ai_description or f"片段 {i}: {clip.filename} (时长: {clip.duration:.1f}秒)"
            descriptions.append(f"ID {i}: {desc}")

        prompt = self.PROMPT_TEMPLATE.format(
            N=len(clips),
            N_minus_1=len(clips) - 1,
            clip_descriptions="\n\n".join(descriptions)
        )

        response = await ai_service.chat([
            {"role": "system", "content": "你是一名专业视频剪辑师，擅长叙事编排和节奏控制。"},
            {"role": "user", "content": prompt},
        ], temperature=0.7, max_tokens=4096)

        # Parse JSON from response
        try:
            # Try direct JSON parse
            data = json.loads(response)
        except json.JSONDecodeError:
            # Extract JSON from markdown code block
            match = re.search(r'```(?:json)?\s*([\s\S]*?)```', response)
            if match:
                try:
                    data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    return [c.id for c in clips], f"Failed to parse AI response: {response[:500]}"
            else:
                return [c.id for c in clips], f"Failed to parse AI response: {response[:500]}"

        order_ids = [clips[i].id for i in data.get("order", list(range(len(clips))))]
        # Ensure all clip IDs are included
        all_ids = {c.id for c in clips}
        for cid in all_ids:
            if cid not in order_ids:
                order_ids.append(cid)

        return order_ids, data.get("reasoning", "No reasoning provided")
