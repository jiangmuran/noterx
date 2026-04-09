"""
Video analysis module.
Uses MiMo omni model video understanding API to extract visual cues from a video.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

from app.agents.base_agent import _get_client, _is_mimo_openai_compat, _parse_json_from_llm_text

logger = logging.getLogger("noterx.video_analyzer")
MIMO_MAX_COMPLETION_TOKENS = 131072
OMNI_DEFAULT_MAX_COMPLETION_TOKENS = 32768


def _read_token_cap(env_name: str, default_value: int) -> int:
    raw = (os.getenv(env_name) or "").strip()
    if not raw:
        return max(0, min(default_value, MIMO_MAX_COMPLETION_TOKENS))
    try:
        value = int(raw)
    except ValueError:
        value = default_value
    return max(0, min(value, MIMO_MAX_COMPLETION_TOKENS))


class VideoAnalyzer:
    """Analyze video semantics through MiMo video understanding."""

    async def analyze(
        self,
        video_data_url: str,
        *,
        prompt_hint: str = "",
        fps: float = 2.0,
        media_resolution: str = "default",
    ) -> dict:
        """
        Analyze one video and return structured summary for downstream diagnosis.
        """
        client = _get_client()
        model = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")
        sys_prompt = (
            "You are a strict JSON video analysis engine. "
            "Return ONLY valid JSON without markdown fences."
        )
        user_prompt = (
            "Analyze the uploaded video for Xiaohongshu note diagnosis and return JSON with fields: "
            "summary (string), "
            "scene_keywords (array of <=8 strings), "
            "cover_suggestion (string), "
            "has_face (boolean), "
            "shot_style (string), "
            "risk_or_limitations (array of strings). "
            "If confidence is low, still return best-effort values."
        )
        if prompt_hint.strip():
            user_prompt += f" Additional context: {prompt_hint.strip()}"

        kwargs = {
            "model": model,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "video_url",
                            "video_url": {"url": video_data_url},
                            "fps": max(0.1, min(float(fps), 10.0)),
                            "media_resolution": media_resolution if media_resolution in ("default", "max") else "default",
                        },
                        {"type": "text", "text": user_prompt},
                    ],
                },
            ],
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.3")),
        }
        max_out = _read_token_cap(
            "VIDEO_UNDERSTANDING_MAX_COMPLETION_TOKENS",
            _read_token_cap("LLM_MAX_COMPLETION_TOKENS", OMNI_DEFAULT_MAX_COMPLETION_TOKENS),
        )
        if _is_mimo_openai_compat():
            kwargs["max_completion_tokens"] = max_out
        else:
            kwargs["max_tokens"] = max_out

        resp = await client.chat.completions.create(**kwargs)
        raw = (resp.choices[0].message.content or "").strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = _parse_json_from_llm_text(raw)

        usage = getattr(resp, "usage", None)
        if usage:
            parsed["_meta"] = {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens,
                "model": resp.model,
            }

        parsed.setdefault("summary", "")
        parsed.setdefault("scene_keywords", [])
        parsed.setdefault("cover_suggestion", "")
        parsed.setdefault("has_face", False)
        parsed.setdefault("shot_style", "")
        parsed.setdefault("risk_or_limitations", [])
        return parsed
