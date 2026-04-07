"""
Agent 基类
封装 LLM 调用、prompt 模板、结构化输出解析。
支持 OpenAI / Anthropic 切换。
"""
import json
import os
import logging
from typing import Optional
from pathlib import Path

from dotenv import load_dotenv

for p in [Path(__file__).resolve().parents[2] / ".env", Path.cwd() / ".env", Path.cwd().parent / ".env"]:
    if p.exists():
        load_dotenv(p)
        break

logger = logging.getLogger("noterx.agent")

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai").lower()


def _get_client():
    """根据 LLM_PROVIDER 环境变量获取对应 API 客户端"""
    if LLM_PROVIDER == "anthropic":
        from anthropic import AsyncAnthropic
        return AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    from openai import AsyncOpenAI
    return AsyncOpenAI(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=os.getenv("OPENAI_BASE_URL", None),
    )


class BaseAgent:
    """所有诊断 Agent 的基类"""

    agent_name: str = "BaseAgent"
    system_prompt: str = ""

    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self.client = _get_client()

    async def call_llm(
        self,
        user_message: str,
        system_override: Optional[str] = None,
    ) -> dict:
        """
        调用 LLM 并解析 JSON 响应。

        @param user_message - 用户消息
        @param system_override - 可选的 system prompt 覆盖
        @returns dict - 解析后的 JSON 响应
        """
        sys_prompt = system_override or self.system_prompt

        if LLM_PROVIDER == "anthropic":
            return await self._call_anthropic(sys_prompt, user_message)
        return await self._call_openai(sys_prompt, user_message)

    async def _call_openai(self, sys_prompt: str, user_message: str) -> dict:
        """OpenAI 兼容调用"""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.7,
                max_tokens=2000,
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content
            result = json.loads(raw)
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
            return self._error_response("LLM 返回了非 JSON 格式的内容")
        except Exception as e:
            logger.warning("OpenAI 调用失败: %s", e)
            return self._error_response(str(e))

    async def _call_anthropic(self, sys_prompt: str, user_message: str) -> dict:
        """Anthropic Claude 调用"""
        try:
            response = await self.client.messages.create(
                model=self.model if "claude" in self.model else "claude-sonnet-4-20250514",
                max_tokens=2000,
                system=sys_prompt,
                messages=[{"role": "user", "content": user_message + "\n\n请以 JSON 格式输出。"}],
            )
            raw = response.content[0].text
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
            result = json.loads(clean)
            usage = response.usage
            if usage:
                result["_meta"] = {
                    "prompt_tokens": usage.input_tokens,
                    "completion_tokens": usage.output_tokens,
                    "total_tokens": usage.input_tokens + usage.output_tokens,
                    "model": response.model,
                }
            return result
        except json.JSONDecodeError:
            return self._error_response("Claude 返回了非 JSON 格式的内容")
        except Exception as e:
            logger.warning("Anthropic 调用失败: %s", e)
            return self._error_response(str(e))

    def _error_response(self, error_msg: str) -> dict:
        """生成错误响应"""
        return {
            "agent_name": self.agent_name,
            "dimension": "error",
            "score": 0,
            "issues": [f"诊断出错: {error_msg}"],
            "suggestions": ["请稍后重试"],
            "reasoning": f"Error: {error_msg}",
        }

    def build_user_message(self, **kwargs) -> str:
        """子类实现：构建发送给 LLM 的用户消息"""
        raise NotImplementedError
