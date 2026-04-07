"""
综合裁判 Agent
汇总各 Agent 观点，处理分歧，输出最终诊断报告。
"""
from __future__ import annotations

import json

from app.agents.base_agent import BaseAgent
from app.agents.prompts.judge_agent import SYSTEM_PROMPT


class JudgeAgent(BaseAgent):
    """综合裁判，生成最终诊断报告"""

    agent_name = "综合裁判"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        category: str,
        agent_opinions: list[dict],
        debate_records: list[dict] | None = None,
    ) -> str:
        """汇总所有 Agent 意见"""
        opinions_text = ""
        for i, op in enumerate(agent_opinions, 1):
            opinions_text += f"""
### Agent {i}: {op.get('agent_name', 'Unknown')}
- **维度**: {op.get('dimension', '')}
- **评分**: {op.get('score', 0)}
- **问题**: {json.dumps(op.get('issues', []), ensure_ascii=False)}
- **建议**: {json.dumps(op.get('suggestions', []), ensure_ascii=False)}
- **推理**: {op.get('reasoning', '')}
"""

        debate_text = ""
        if debate_records:
            debate_text = "\n## 辩论记录\n"
            for record in debate_records:
                debate_text += f"""
**{record.get('agent_name', '')}的辩论意见:**
- 同意: {json.dumps(record.get('agreements', []), ensure_ascii=False)}
- 反对: {json.dumps(record.get('disagreements', []), ensure_ascii=False)}
- 补充: {json.dumps(record.get('additions', []), ensure_ascii=False)}
"""

        msg = f"""## 待综合判定的笔记
- **垂类**: {category}
- **标题**: {title}

## 各Agent诊断意见
{opinions_text}
{debate_text}

请综合以上所有Agent的意见和辩论记录，给出最终的诊断报告。"""
        return msg

    async def diagnose(self, **kwargs) -> dict:
        """执行综合裁判"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(msg)
