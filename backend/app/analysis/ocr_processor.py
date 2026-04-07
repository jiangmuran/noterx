"""
OCR 处理模块
对截图类输入提取文字内容。当前使用 LLM 视觉能力代替传统 OCR。
"""
from __future__ import annotations

import base64
import os


class OCRProcessor:
    """从图片中提取文字内容"""

    async def extract_text(self, image_bytes: bytes, client=None) -> dict:
        """
        从截图中提取笔记标题、正文和标签。
        使用 LLM 的视觉能力进行 OCR。

        @param image_bytes - 图片字节数据
        @param client - OpenAI 兼容的 API client
        @returns dict 包含 title, content, tags
        """
        if client is None:
            return self._fallback_result()

        b64_image = base64.b64encode(image_bytes).decode("utf-8")

        try:
            ocr_model = os.getenv("LLM_MODEL", "gpt-4o")
            response = await client.chat.completions.create(
                model=ocr_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是一个小红书笔记内容提取器。"
                            "请从截图中提取笔记的标题、正文和标签。"
                            "以JSON格式输出：{\"title\": \"...\", \"content\": \"...\", \"tags\": [...]}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "请提取这张小红书笔记截图中的标题、正文和标签。"},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64_image}"},
                            },
                        ],
                    },
                ],
                max_tokens=1500,
            )
            import json
            raw = response.choices[0].message.content
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(clean)
        except Exception as e:
            print(f"OCR 提取失败: {e}")
            return self._fallback_result()

    def _fallback_result(self) -> dict:
        """OCR 不可用时的回退结果"""
        return {"title": "", "content": "", "tags": []}
