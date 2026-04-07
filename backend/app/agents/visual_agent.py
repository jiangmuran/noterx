"""
视觉诊断 Agent
分析封面构图、配色、视觉吸引力。
"""
from __future__ import annotations

import json

from app.agents.base_agent import BaseAgent
from app.agents.prompts.visual_agent import SYSTEM_PROMPT


class VisualAgent(BaseAgent):
    """分析封面视觉表现"""

    agent_name = "视觉诊断师"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        category: str,
        image_analysis: dict | None,
        baseline_comparison: dict,
    ) -> str:
        """构建包含图像分析结果和 baseline 对比的消息"""
        comparisons = baseline_comparison.get("comparisons", {})

        if image_analysis:
            image_info = f"""## 封面图像分析
- 尺寸: {image_analysis.get('width', 0)}x{image_analysis.get('height', 0)}
- 宽高比: {image_analysis.get('aspect_ratio', 0)}
- 饱和度: {image_analysis.get('saturation', 0)}
- 亮度: {image_analysis.get('brightness', 0)}
- 检测到人脸: {'是' if image_analysis.get('has_face') else '否'}
- 文字区域占比: {image_analysis.get('text_ratio', 0)}
- 主色调: {json.dumps(image_analysis.get('dominant_colors', []))}"""
        else:
            image_info = "## 封面图像分析\n未收到封面图片，请基于标题和垂类给出封面建议。"

        cover_comp = ""
        if "cover_saturation" in comparisons:
            cs = comparisons["cover_saturation"]
            cover_comp += f"- 封面饱和度: 用户{cs.get('user_value', 'N/A')} vs 垂类均值{cs.get('category_avg', 'N/A')} ({cs.get('verdict', '')})\n"
        if "cover_text_ratio" in comparisons:
            ct = comparisons["cover_text_ratio"]
            cover_comp += f"- 文字占比: 用户{ct.get('user_value', 'N/A')} vs 垂类均值{ct.get('category_avg', 'N/A')} ({ct.get('verdict', '')})\n"
        if "cover_face" in comparisons:
            cf = comparisons["cover_face"]
            cover_comp += f"- 人脸出镜: 用户{'是' if cf.get('user_has_face') else '否'}, 垂类人脸率{cf.get('category_face_rate', 'N/A')} {cf.get('suggestion', '')}\n"

        msg = f"""## 待诊断笔记
- **垂类**: {category}
- **标题**: {title}

{image_info}

## Baseline封面对比
{cover_comp if cover_comp else '暂无对比数据'}

请基于以上数据给出你的视觉诊断。"""
        return msg

    async def diagnose(self, **kwargs) -> dict:
        """执行视觉诊断"""
        msg = self.build_user_message(**kwargs)
        return await self.call_llm(msg)
