"""
Agent 基类
封装 LLM 调用、prompt 模板、结构化输出解析。
支持多模型：flash(快速) / pro(专业) / omni(多模态)。
兼容小米 MiMo（OpenAI 格式）等第三方网关。
"""
import json
import os
import logging
import re
from typing import Optional
from pathlib import Path

from dotenv import load_dotenv


def _load_env_files() -> None:
    """
    按优先级加载环境变量：
    1) 仓库根目录 .env（推荐放真实密钥）
    2) backend/.env
    3) 当前工作目录及其父目录 .env（兼容不同启动方式）
    先加载的值优先（override=False），避免被占位值覆盖。
    """
    current = Path(__file__).resolve()
    backend_root = current.parents[2]
    repo_root = current.parents[3]
    candidates = [
        repo_root / ".env",
        backend_root / ".env",
        Path.cwd() / ".env",
        Path.cwd().parent / ".env",
    ]
    seen: set[Path] = set()
    for p in candidates:
        rp = p.resolve()
        if rp in seen:
            continue
        seen.add(rp)
        if rp.exists():
            load_dotenv(rp, override=False)


_load_env_files()

logger = logging.getLogger("noterx.agent")

MODEL_FAST = os.getenv("LLM_MODEL_FAST", "mimo-v2-flash")
MODEL_PRO = os.getenv("LLM_MODEL_PRO", "mimo-v2-pro")
MODEL_OMNI = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")


def _is_mimo_openai_compat() -> bool:
    """
    是否按小米 MiMo OpenAPI（OpenAI 兼容）处理参数。
    可由 OPENAI_COMPAT=mimo 显式开启，或由 BASE_URL / 模型名推断。
    """
    if os.getenv("OPENAI_COMPAT", "").strip().lower() == "mimo":
        return True
    base = (os.getenv("OPENAI_BASE_URL") or "").lower()
    if "xiaomimimo.com" in base or "mimo-v2.com" in base:
        return True
    model = (os.getenv("LLM_MODEL") or "").lower()
    return model.startswith("mimo-")


def _resolve_openai_base_url() -> Optional[str]:
    """
    解析 OpenAI 兼容服务的 base_url；误把 Key 填进 OPENAI_BASE_URL 时给出默认 MiMo 地址提示。
    """
    raw = (os.getenv("OPENAI_BASE_URL") or "").strip()
    if raw.startswith("sk-") and len(raw) > 30:
        logger.warning(
            "OPENAI_BASE_URL 的值看起来像 API Key。请把密钥放在 OPENAI_API_KEY，"
            "此处填写网关地址，例如 https://api.xiaomimimo.com/v1"
        )
        raw = ""
    if raw:
        return raw.rstrip("/")
    if _is_mimo_openai_compat():
        return "https://api.xiaomimimo.com/v1"
    return None


def _get_client():
    """获取 OpenAI 兼容 API 客户端（绕过本地代理）"""
    import httpx
    from openai import AsyncOpenAI
    http_client = httpx.AsyncClient(
        proxy=None,
        trust_env=False,
        timeout=httpx.Timeout(120.0, connect=30.0),
    )
    return AsyncOpenAI(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=_resolve_openai_base_url(),
        http_client=http_client,
    )


def _parse_json_from_llm_text(raw: Optional[str]) -> dict:
    """从模型输出中提取 JSON（支持 ```json 代码块）。"""
    if not raw or not raw.strip():
        raise json.JSONDecodeError("empty", "", 0)
    clean = raw.strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
        clean = re.sub(r"\s*```\s*$", "", clean)
    return json.loads(clean)


def _should_retry_openai_without_json_format(exc: BaseException) -> bool:
    """部分兼容网关不支持 response_format=json_object，可去掉后重试。"""
    msg = str(exc).lower()
    if "response_format" in msg or "json_object" in msg:
        return True
    code = getattr(exc, "status_code", None)
    if code is None and hasattr(exc, "response"):
        code = getattr(getattr(exc, "response", None), "status_code", None)
    return code in (400, 422)


class BaseAgent:
    """所有诊断 Agent 的基类"""

    agent_name: str = "BaseAgent"
    system_prompt: str = ""

    def __init__(self, model: Optional[str] = None):
        self.model = model or MODEL_PRO
        self.client = _get_client()

    async def call_llm(
        self,
        user_message: str,
        system_override: Optional[str] = None,
        model_override: Optional[str] = None,
        max_tokens: int = 2048,
    ) -> dict:
        sys_prompt = system_override or self.system_prompt
        if model_override:
            self.model = model_override

        return await self._call_openai(sys_prompt, user_message, max_tokens=max_tokens)

    async def _call_openai(self, sys_prompt: str, user_message: str, max_tokens: int = 2048) -> dict:
        """OpenAI 兼容调用（含小米 MiMo 等网关的参数与 JSON 模式兼容）。"""
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_message},
        ]
        mimo = _is_mimo_openai_compat()
        max_out = max_tokens or int(os.getenv("LLM_MAX_COMPLETION_TOKENS", "2048"))
        skip_json_mode = os.getenv("LLM_SKIP_JSON_RESPONSE_FORMAT", "").strip() in ("1", "true", "yes")

        async def _create(with_json_object: bool):
            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": float(os.getenv("LLM_TEMPERATURE", "0.7")),
            }
            if mimo:
                kwargs["max_completion_tokens"] = max_out
            else:
                kwargs["max_tokens"] = max_out
            if with_json_object and not skip_json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            return await self.client.chat.completions.create(**kwargs)

        response = None
        last_err: Optional[BaseException] = None
        attempts: list[bool] = []
        if not skip_json_mode:
            attempts.append(True)
        attempts.append(False)

        for use_json in attempts:
            try:
                response = await _create(with_json_object=use_json)
                break
            except Exception as e:
                last_err = e
                if use_json and _should_retry_openai_without_json_format(e):
                    logger.info("网关可能不支持 response_format=json_object，将不带该参数重试: %s", e)
                    continue
                logger.warning("OpenAI 调用失败: %s", e)
                return self._error_response(str(e))

        if response is None:
            return self._error_response(str(last_err) if last_err else "LLM 无响应")

        try:
            raw = response.choices[0].message.content
            try:
                result = json.loads(raw)
            except json.JSONDecodeError:
                result = _parse_json_from_llm_text(raw)
            usage = response.usage
            if usage:
                result["_meta"] = {
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                    "model": response.model,
                }
            return result
        except json.JSONDecodeError:
            logger.warning("LLM 原始输出（非 JSON）: %s", (raw or "")[:500])
            return self._error_response("LLM 返回了非 JSON 格式的内容")
        except Exception as e:
            logger.warning("解析 LLM 响应失败: %s", e)
            return self._error_response(str(e))

    async def call_llm_vision(
        self,
        text_message: str,
        image_b64: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
    ) -> dict:
        """调用多模态模型分析图像"""
        sys_prompt = system_prompt or self.system_prompt
        try:
            response = await self.client.chat.completions.create(
                model=MODEL_OMNI,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": text_message},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                        ],
                    },
                ],
                max_tokens=max_tokens,
            )
            raw = response.choices[0].message.content
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
            result = json.loads(clean)
            usage = response.usage
            if usage:
                result["_meta"] = {
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                    "model": response.model,
                }
            return result
        except json.JSONDecodeError:
            return self._error_response("多模态模型返回了非 JSON 格式的内容")
        except Exception as e:
            logger.warning("多模态调用失败: %s", e)
            return self._error_response(str(e))

    def _error_response(self, error_msg: str) -> dict:
        lower_msg = (error_msg or "").lower()
        suggestions = ["请稍后重试"]
        if "invalid api key" in lower_msg or "invalid_key" in lower_msg or "401" in lower_msg:
            suggestions = [
                "API Key 无效：请检查 OPENAI_API_KEY 是否正确、未过期，并确认与 OPENAI_BASE_URL 对应。",
                "如果使用仓库根目录 .env 启动，请确认 backend/.env 里的占位值不会覆盖真实配置。",
            ]
        return {
            "agent_name": self.agent_name,
            "dimension": "error",
            "score": 0,
            "issues": [f"诊断出错: {error_msg}"],
            "suggestions": suggestions,
            "reasoning": f"Error: {error_msg}",
        }

    def build_user_message(self, **kwargs) -> str:
        raise NotImplementedError
