"""generate-comments API：LLM 失败时应返回 503 而非空列表。"""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from app.api.comments_api import generate_comments, GenerateCommentsRequest


def test_generate_comments_raises_on_llm_error():
    err = {
        "agent_name": "BaseAgent",
        "dimension": "error",
        "score": 0,
        "issues": ["诊断出错: API 余额不足"],
        "suggestions": ["请稍后重试"],
        "reasoning": "Error: 402",
    }
    with patch("app.api.comments_api.BaseAgent") as MockAgent:
        inst = MockAgent.return_value
        inst.call_llm = AsyncMock(return_value=err)
        req = GenerateCommentsRequest(title="标题", content="正文", category="food", existing_count=1)
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            asyncio.run(generate_comments(req))
        assert exc.value.status_code == 503
        assert "诊断出错" in str(exc.value.detail)
