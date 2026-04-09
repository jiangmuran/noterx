"""
迭代优化接口：根据原始诊断结果生成2-3个高分优化方案，自动评分排序。
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Form
from pydantic import BaseModel

from app.agents.base_agent import BaseAgent, MODEL_PRO, MODEL_FAST
from app.agents.research_data import pre_score

router = APIRouter()
logger = logging.getLogger("noterx.optimize")

OPTIMIZE_PROMPT = """你是小红书爆款内容优化专家。根据用户笔记的诊断结果（扣分原因），生成3个不同策略的优化方案。

## 每个方案包含
- strategy: 策略名称（如"情绪向""数据向""悬念向"）
- optimized_title: 完整可发布标题（12-20字，至少2个钩子元素）
- optimized_content: 完整可发布正文（小红书排版，300字内，emoji分段，口语化）
- key_changes: 关键改动说明（2-3句话）

## 3个方案必须风格不同
方案A: 情绪驱动（感叹号、共鸣、夸张）
方案B: 数据驱动（数字、对比、干货）
方案C: 悬念驱动（提问、反转、好奇心）

## 正文排版规范
- 每段2-3句，段间空行
- 关键信息前用emoji（🔥💡✨📌❗）
- 口语化（姐妹们、绝了、真的）
- 结尾互动引导句
- 300字内

输出严格JSON：
{"plans":[{"strategy":"策略名","optimized_title":"标题","optimized_content":"正文","key_changes":"改动说明"},...]}\n"""


class OptimizeRequest(BaseModel):
    title: str
    content: str = ""
    category: str = "food"
    issues: str = ""  # JSON string of issues array
    suggestions: str = ""  # JSON string of suggestions array
    overall_score: float = 50


@router.post("/optimize")
async def optimize(req: OptimizeRequest):
    """生成2-3个优化方案并自动评分"""
    issues_text = req.issues[:500] if req.issues else "无具体扣分项"
    suggestions_text = req.suggestions[:500] if req.suggestions else ""

    user_msg = f"""原始笔记：
- 标题：{req.title}
- 正文：{req.content[:400] if req.content else '（无正文）'}
- 品类：{req.category}
- 当前评分：{req.overall_score}分

主要问题：{issues_text}
优化方向：{suggestions_text}

请生成3个不同策略的高分优化方案。"""

    agent = BaseAgent(model=MODEL_PRO)
    agent.system_prompt = OPTIMIZE_PROMPT
    result = await agent.call_llm(user_msg, max_tokens=3000)
    result.pop("_meta", None)

    plans = result.get("plans", [])
    if not isinstance(plans, list):
        plans = []

    # Auto-score each plan with pre_score
    tag_count = 0
    scored_plans = []
    for plan in plans[:3]:
        if not isinstance(plan, dict):
            continue
        title = plan.get("optimized_title", req.title)
        content = plan.get("optimized_content", req.content)
        try:
            score_result = pre_score(title, content, req.category, tag_count, 0)
            plan_score = score_result["total_score"]
        except Exception:
            plan_score = req.overall_score + 5  # fallback
        scored_plans.append({
            "strategy": plan.get("strategy", "优化方案"),
            "optimized_title": title,
            "optimized_content": content,
            "key_changes": plan.get("key_changes", ""),
            "score": round(plan_score),
            "score_delta": round(plan_score - req.overall_score),
        })

    # Sort by score descending
    scored_plans.sort(key=lambda x: x["score"], reverse=True)

    # Mark the best one
    if scored_plans:
        scored_plans[0]["recommended"] = True

    return {
        "original_score": round(req.overall_score),
        "plans": scored_plans,
    }
