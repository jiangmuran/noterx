"""
OCR 处理模块
使用 mimo-v2-omni 多模态模型提取截图中的笔记信息。
"""

from __future__ import annotations

import base64
import json
import logging
import os

from app.agents.base_agent import _is_mimo_openai_compat

logger = logging.getLogger("noterx.ocr")


class OCRProcessor:
    """从图片中提取文本内容。"""

    async def extract_text(
        self,
        image_bytes: bytes,
        client=None,
        *,
        max_tokens_override: int | None = None,
    ) -> dict:
        if client is None:
            return self._fallback_result()

        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        ocr_model = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")

        try:
            msg_body: list | str = [
                {"type": "text", "text": "请基于截图语义提取标题、正文要点和标签；无需逐字 OCR 整屏。"},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64_image}"},
                },
            ]
            kwargs = {
                "model": ocr_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "你是一个小红书截图信息提取助手。"
                            "请优先做内容理解，再提取关键字段；看不清就留空，不要臆造。"
                            '仅输出 JSON：{"title": "...", "content": "...", "tags": [...]}'
                        ),
                    },
                    {"role": "user", "content": msg_body},
                ],
            }
            env_cap = int(os.getenv("LLM_OCR_MAX_TOKENS", "1500"))
            if max_tokens_override is not None:
                env_cap = min(env_cap, max_tokens_override)
            if _is_mimo_openai_compat():
                kwargs["max_completion_tokens"] = min(env_cap, 4096)
            else:
                kwargs["max_tokens"] = min(env_cap, 4096)

            response = await client.chat.completions.create(**kwargs)
            raw = response.choices[0].message.content or ""
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(clean)
        except Exception as e:
            logger.warning("OCR 提取失败: %s", e)
            return self._fallback_result()

    def _fallback_result(self) -> dict:
        return {"title": "", "content": "", "tags": []}
