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
    仅从真实 `.env` 加载；**绝不**加载 `.env.example`（模板不含有效密钥，且不得参与 runtime）。

    顺序与 override：
    - 先读仓库根 `.env`（override=False，仅补齐尚未出现在进程环境中的键）。
    - 再读 `backend/.env`（override=True），**以后者为准**，避免根目录误留空/占位 OPENAI_API_KEY 挡住 backend 里的真密钥。
    - 最后读当前工作目录及其父目录的 `.env`（override=True，便于本地覆盖；路径去重）。
    """
    current = Path(__file__).resolve()
    backend_root = current.parents[2]
    repo_root = current.parents[3]
    candidates: list[tuple[Path, bool]] = [
        (repo_root / ".env", False),
        (backend_root / ".env", True),
        (Path.cwd() / ".env", True),
        (Path.cwd().parent / ".env", True),
    ]
    seen: set[Path] = set()
    for p, override in candidates:
        if p.name == ".env.example":
            continue
        rp = p.resolve()
        if rp in seen:
            continue
        if not rp.is_file():
            continue
        seen.add(rp)
        load_dotenv(rp, override=override)


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


def _normalize_llm_output_for_json(raw: str) -> str:
    """
    去掉推理模型常见「思考」前缀，避免干扰 JSON 定位。
    部分网关会在最终 JSON 前输出 redacted_reasoning / think 等思考块。
    """
    t = str(raw).strip()
    # 取最后一个闭合标记之后的正文（思考在前、JSON 在后）
    split_markers = (
        "</redacted_reasoning>",
        "</redacted_thinking>",
        "</think>",
    )
    for pat in split_markers:
        if pat.lower() in t.lower():
            parts = re.split(re.escape(pat), t, flags=re.IGNORECASE)
            t = parts[-1].strip()
    t = re.sub(r"<redacted_reasoning>[\s\S]*?</redacted_reasoning>", "", t, flags=re.IGNORECASE)
    t = re.sub(r"<redacted_thinking>[\s\S]*?</redacted_thinking>", "", t, flags=re.IGNORECASE)
    return t.strip()


def _parse_json_from_llm_text(raw: Optional[str]) -> dict:
    """
    从模型输出中解析 JSON 对象（诊断 Agent 均要求顶层为 object）。
    兼容：思考标签、前后废话、```json 代码块、首个 { 非答案（多候选 raw_decode）等。
    """
    if not raw or not str(raw).strip():
        raise json.JSONDecodeError("empty", "", 0)
    text = _normalize_llm_output_for_json(str(raw).strip())

    # 1) 提取 ``` / ```json 代码块（非贪婪到第一个闭合 fence）
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    elif text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text)

    # 2) 整段即 JSON
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and len(obj) > 0:
            return obj
    except json.JSONDecodeError:
        pass

    # 3) 从每个「可能的」{ 起 raw_decode（思考里可能出现示例 JSON，首个 { 常非最终答案）
    decoder = json.JSONDecoder()
    brace_starts = [i for i, c in enumerate(text) if c == "{"]
    last_err: Optional[Exception] = None
    for start in brace_starts[:16]:
        try:
            obj, _end = decoder.raw_decode(text, start)
        except json.JSONDecodeError as e:
            last_err = e
            continue
        if isinstance(obj, dict) and len(obj) > 0:
            return obj
    if last_err is not None:
        logger.warning(
            "JSON raw_decode 均失败（可调高 LLM_MAX_COMPLETION_TOKENS / JUDGE_MAX_COMPLETION_TOKENS）: %s",
            last_err,
        )
    raise json.JSONDecodeError("no valid json object in output", text, 0)


def _bytes_to_image_data_url(image_bytes: bytes) -> str:
    """
    根据魔数选择 MIME，生成 OpenAI/MiMo 兼容的 data URL（多模态 image_url）。
    """
    import base64

    if not image_bytes:
        raise ValueError("image_bytes is empty")
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    if image_bytes.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif len(image_bytes) > 12 and image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        mime = "image/webp"
    elif image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        mime = "image/gif"
    else:
        mime = "image/jpeg"
    return f"data:{mime};base64,{b64}"


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
                "temperature": float(os.getenv("LLM_TEMPERATURE", "0")),
            }
            # seed for reproducibility (if supported by provider)
            seed_val = os.getenv("LLM_SEED", "")
            if seed_val:
                kwargs["seed"] = int(seed_val)
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
                result = json.loads(raw or "")
            except json.JSONDecodeError:
                result = _parse_json_from_llm_text(raw)
            if not isinstance(result, dict):
                logger.warning("LLM 返回顶层非 object: %s", str(raw)[:400])
                return self._error_response("LLM 返回了非 JSON 对象（应为 {...}）")
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
        image_bytes: bytes,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
    ) -> dict:
        """
        调用多模态模型（MODEL_OMNI）分析图像；image_bytes 须为 JPEG/PNG/WebP 等原始字节。
        """
        sys_prompt = system_prompt or self.system_prompt
        mimo = _is_mimo_openai_compat()
        max_out = max_tokens or int(os.getenv("LLM_MAX_COMPLETION_TOKENS", "2048"))
        skip_json_mode = os.getenv("LLM_SKIP_JSON_RESPONSE_FORMAT", "").strip() in ("1", "true", "yes")
        temp = float(os.getenv("LLM_TEMPERATURE", "0"))
        data_url = _bytes_to_image_data_url(image_bytes)

        async def _create(with_json_object: bool):
            kwargs: dict = {
                "model": MODEL_OMNI,
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": text_message},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    },
                ],
                "temperature": temp,
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
                    logger.info("多模态网关可能不支持 response_format=json_object，将不带该参数重试: %s", e)
                    continue
                logger.warning("多模态调用失败: %s", e)
                return self._error_response(str(e))

        if response is None:
            return self._error_response(str(last_err) if last_err else "多模态 LLM 无响应")

        raw: Optional[str] = None
        try:
            raw = response.choices[0].message.content
            try:
                result = json.loads((raw or "").strip())
            except json.JSONDecodeError:
                result = _parse_json_from_llm_text(raw)
            if not isinstance(result, dict):
                return self._error_response("多模态模型返回了非 JSON 对象")
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
            logger.warning("多模态原始输出（非 JSON）: %s", (raw or "")[:800])
            return self._error_response("多模态模型返回了非 JSON 格式的内容")
        except Exception as e:
            logger.warning("解析多模态响应失败: %s", e)
            return self._error_response(str(e))

    def _error_response(self, error_msg: str) -> dict:
        lower_msg = (error_msg or "").lower()
        suggestions = ["请稍后重试"]
        if "invalid api key" in lower_msg or "invalid_key" in lower_msg or "401" in lower_msg:
            suggestions = [
                "API Key 无效：请检查 OPENAI_API_KEY 是否正确、未过期，并确认与 OPENAI_BASE_URL 对应。",
                "密钥以 `backend/.env`（及仓库根 `.env`）为准；请勿把 `.env.example` 当作配置源，模板中的占位值无效。",
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
