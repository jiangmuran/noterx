"""
OCR 处理模块
使用 mimo-v2-omni 多模态模型提取截图中的笔记信息。
"""

from __future__ import annotations

import base64
import json
import logging
import os

from app.agents.base_agent import _is_mimo_openai_compat, _should_retry_openai_without_json_format

logger = logging.getLogger("noterx.ocr")


def _parse_json_best_effort(raw: str) -> dict:
    clean = (raw or "").strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        left = clean.find("{")
        right = clean.rfind("}")
        if left != -1 and right != -1 and right > left:
            return json.loads(clean[left : right + 1])
        raise


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
        temperature = float(os.getenv("LLM_OCR_TEMPERATURE", "0.1"))

        try:
            msg_body: list | str = [
                {
                    "type": "text",
                    "text": (
                        "请尽可能完整提取截图中可见的标题、正文和标签。"
                        "如果正文较长，优先连续输出可见正文，不要只做摘要。"
                        "看不清的部分可以留空，但不要自行编造。"
                    ),
                },
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
                            "请优先完整提取截图里可见的标题、正文和标签。"
                            "如果是长截图或正文页，尽量连续输出正文，不要只提炼要点。"
                            "看不清就留空，不要臆造。"
                            '仅输出 JSON：{"title": "...", "content": "...", "tags": [...]}'
                        ),
                    },
                    {"role": "user", "content": msg_body},
                ],
                "temperature": temperature,
            }
            env_cap = int(os.getenv("LLM_OCR_MAX_TOKENS", "4000"))
            if max_tokens_override is not None:
                env_cap = min(env_cap, max_tokens_override)
            cap = min(env_cap, 4096)
            if _is_mimo_openai_compat():
                kwargs["max_completion_tokens"] = cap
            else:
                kwargs["max_tokens"] = cap

            last_error: Exception | None = None
            last_raw = ""
            for use_json_mode in (True, False):
                req = dict(kwargs)
                if use_json_mode:
                    req["response_format"] = {"type": "json_object"}
                try:
                    response = await client.chat.completions.create(**req)
                    raw = response.choices[0].message.content or ""
                    last_raw = raw
                    return _parse_json_best_effort(raw)
                except Exception as e:
                    last_error = e if isinstance(e, Exception) else Exception(str(e))
                    if use_json_mode and _should_retry_openai_without_json_format(e):
                        continue
                    if use_json_mode:
                        continue
                    break

            if last_error:
                logger.warning("OCR 提取失败: %s; raw=%s", last_error, (last_raw or "")[:300])
            return self._fallback_result()
        except Exception as e:
            logger.warning("OCR 提取失败: %s", e)
            return self._fallback_result()

    def _fallback_result(self) -> dict:
        return {"title": "", "content": "", "tags": []}
