"""
Visual diagnosis agent.
Analyzes cover composition/color/attraction, and can fallback to video semantics.
"""
from __future__ import annotations

import json
import logging
import os

from app.agents.base_agent import BaseAgent
from app.agents.prompts.visual_agent import SYSTEM_PROMPT
from app.agents.research_data import build_data_prompt_for_agent

logger = logging.getLogger("noterx.visual_agent")


class VisualAgent(BaseAgent):
    """Analyze visual performance of cover/video."""

    agent_name = "视觉诊断师"
    system_prompt = SYSTEM_PROMPT

    def build_user_message(
        self,
        title: str,
        category: str,
        image_analysis: dict | None,
        baseline_comparison: dict,
        video_analysis: dict | None = None,
    ) -> str:
        """Build prompt with image analysis/video analysis + baseline comparison."""
        comparisons = baseline_comparison.get("comparisons", {})

        image_parts: list[str] = []
        if image_analysis:
            image_parts.append(f"""## 封面图像分析
- 尺寸: {image_analysis.get('width', 0)}x{image_analysis.get('height', 0)}
- 宽高比: {image_analysis.get('aspect_ratio', 0)}
- 饱和度: {image_analysis.get('saturation', 0)}
- 亮度: {image_analysis.get('brightness', 0)}
- 检测到人脸: {'是' if image_analysis.get('has_face') else '否'}
- 文字区域占比: {image_analysis.get('text_ratio', 0)}
- 主色调: {json.dumps(image_analysis.get('dominant_colors', []), ensure_ascii=False)}""")
        if video_analysis:
            image_parts.append(f"""## 视频理解结果（用于视觉诊断）
- 摘要: {video_analysis.get('summary', '')}
- 场景关键词: {json.dumps(video_analysis.get('scene_keywords', []), ensure_ascii=False)}
- 推荐封面方向: {video_analysis.get('cover_suggestion', '')}
- 是否有人脸: {'是' if video_analysis.get('has_face') else '否'}
- 镜头风格: {video_analysis.get('shot_style', '')}
- 风险/限制: {json.dumps(video_analysis.get('risk_or_limitations', []), ensure_ascii=False)}""")
        if image_parts:
            image_info = "\n\n".join(image_parts)
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
            cover_comp += (
                f"- 人脸出镜: 用户{'是' if cf.get('user_has_face') else '否'}, "
                f"垂类人脸率{cf.get('category_face_rate', 'N/A')} {cf.get('suggestion', '')}\n"
            )

        msg = f"""## 待诊断笔记
- **垂类**: {category}
- **标题**: {title}

{image_info}

## Baseline封面对比
{cover_comp if cover_comp else '暂无对比数据'}

请基于以上数据给出你的视觉诊断。"""
        msg += build_data_prompt_for_agent("visual", category)
        return msg

    async def diagnose(
        self,
        *,
        title: str,
        category: str,
        image_analysis: dict | None,
        baseline_comparison: dict,
        video_analysis: dict | None = None,
        cover_image_bytes: bytes | None = None,
    ) -> dict:
        """
        视觉诊断：若有封面字节则走多模态（MODEL_OMNI）直接看图；否则纯文本推断。
        """
        msg = self.build_user_message(
            title=title,
            category=category,
            image_analysis=image_analysis,
            baseline_comparison=baseline_comparison,
            video_analysis=video_analysis,
        )
        vision_tail = (
            "\n\n## 任务说明\n"
            "已附上笔记**封面图**。请直接观察画面中的主体、文字、色彩、构图、人物/产品与背景，"
            "结合上文量化指标与 Baseline 输出严格 JSON；**reasoning 中必须引用你看到的具体画面元素**（如「左上角黄色大字」「中央人物半身」）。"
        )
        if cover_image_bytes:
            try:
                from app.analysis.image_vision_prep import jpeg_bytes_for_vision

                jpeg = jpeg_bytes_for_vision(cover_image_bytes)
                max_tok = int(os.getenv("VISUAL_AGENT_MAX_COMPLETION_TOKENS", "2500"))
                return await self.call_llm_vision(msg + vision_tail, jpeg, max_tokens=max_tok)
            except Exception as e:
                logger.warning("封面多模态诊断失败，降级为纯文本: %s", e)
                return await self.call_llm(msg)
        return await self.call_llm(msg)
