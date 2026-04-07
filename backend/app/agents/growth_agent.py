"""
增长策略 Agent
分析标签、发布时间、互动策略。
"""
from __future__ import annotations

import json

from app.agents.base_agent import BaseAgent
from app.agents.prompts.growth_agent import SYSTEM_PROMPT


class GrowthAgent(BaseAgent):
    """分析笔记的增长策略"""

    agent_name = "增长策略师"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        content: str,
        category: str,
        tags: list[str],
        baseline_comparison: dict,
    ) -> str:
        """构建包含标签和运营数据的消息"""
        comparisons = baseline_comparison.get("comparisons", {})

        tag_info = comparisons.get("tag_count", {})
        tag_rel = comparisons.get("tag_relevance", {})
        best_hours = comparisons.get("best_publish_hours", [])
        viral_rate = comparisons.get("viral_rate", 0)

        msg = f"""## 待诊断笔记
- **垂类**: {category}
- **标题**: {title}
- **正文**: {content[:200] if content else '（无正文）'}...
- **用户标签**: {json.dumps(tags, ensure_ascii=False)}

## 标签分析
- 标签数量: {tag_info.get('user_value', len(tags))}
- 垂类平均标签数: {tag_info.get('category_avg', 'N/A')}
- 命中热门标签: {json.dumps(tag_rel.get('matched_hot_tags', []), ensure_ascii=False)}
- 热门标签覆盖率: {tag_rel.get('hot_tag_coverage', 0)}
- 该垂类Top10标签: {json.dumps(tag_rel.get('top_tags_in_category', []), ensure_ascii=False)}

## 发布时间建议
- 该垂类互动最高时段: {best_hours}

## 该垂类爆款率
- {viral_rate}%

请基于以上数据给出增长策略诊断和具体建议。"""
        return msg

    async def diagnose(self, **kwargs) -> dict:
        """执行增长策略诊断"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(msg)
