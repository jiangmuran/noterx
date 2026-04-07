"""
用户模拟 Agent
模拟目标受众看到笔记的第一反应和评论。
"""
from __future__ import annotations

import json

from app.agents.base_agent import BaseAgent
from app.agents.prompts.user_sim_agent import SYSTEM_PROMPT


class UserSimAgent(BaseAgent):
    """模拟目标用户的反应和评论"""

    agent_name = "用户模拟器"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        content: str,
        category: str,
        tags: list[str],
    ) -> str:
        """构建完整笔记内容供模拟"""
        category_names = {"food": "美食", "fashion": "穿搭", "tech": "科技"}
        cat_cn = category_names.get(category, category)

        msg = f"""## 待模拟的笔记
- **垂类**: {cat_cn}
- **标题**: {title}
- **标签**: {json.dumps(tags, ensure_ascii=False)}
- **正文**:
{content if content else '（正文为空，仅有标题和封面）'}

请模拟不同类型的小红书用户看到这篇{cat_cn}笔记后的反应，
并生成模拟评论区。"""
        return msg

    async def diagnose(self, **kwargs) -> dict:
        """执行用户模拟"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(msg)
