"""
多 Agent 编排器
管理诊断流程：解析 -> baseline对比 -> 并行Agent诊断 -> 辩论 -> 综合裁判。
模型分配：pro(深度分析) / omni(图像理解) / flash(快速任务)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Optional

from app.analysis.text_analyzer import TextAnalyzer
from app.analysis.image_analyzer import ImageAnalyzer
from app.baseline.comparator import BaselineComparator
from app.agents.base_agent import MODEL_PRO
from app.agents.content_agent import ContentAgent
from app.agents.visual_agent import VisualAgent
from app.agents.growth_agent import GrowthAgent
from app.agents.user_sim_agent import UserSimAgent
from app.agents.judge_agent import JudgeAgent
from app.agents.base_agent import _is_mimo_openai_compat
from app.agents.prompts.debate import DEBATE_PROMPT

logger = logging.getLogger("noterx.orchestrator")


def _normalize_issues_items(raw: list | None) -> list[dict]:
    """
    将 issues 统一为 list[dict]，满足 DiagnoseResponse；
    裁判失败时 BaseAgent 可能返回字符串列表。
    """
    out: list[dict] = []
    for it in raw or []:
        if isinstance(it, dict):
            desc = it.get("description") or it.get("msg") or ""
            row = {**it, "description": desc or str(it)}
            row.setdefault("severity", "high")
            row.setdefault("from_agent", row.get("from_agent") or "")
            out.append(row)
        else:
            out.append({
                "severity": "high",
                "description": str(it),
                "from_agent": "系统",
            })
    return out


def _normalize_suggestions_items(raw: list | None) -> list[dict]:
    """将 suggestions 统一为 list[dict]（priority / description / expected_impact）。"""
    out: list[dict] = []
    for it in raw or []:
        if isinstance(it, dict):
            out.append({
                "priority": int(it.get("priority", 1)),
                "description": str(it.get("description", "")),
                "expected_impact": str(it.get("expected_impact", "")),
            })
        else:
            out.append({
                "priority": 1,
                "description": str(it),
                "expected_impact": "",
            })
    return out


class Orchestrator:
    """多 Agent 诊断编排器"""

    def __init__(self, model: Optional[str] = None):
        """
        @param model - 覆盖默认模型；未传时使用 LLM_MODEL；小米 MiMo 可回退 mimo-v2-omni
        """
        if model:
            self.model = model
        else:
            env_model = os.getenv("LLM_MODEL", "").strip()
            if env_model:
                self.model = env_model
            elif _is_mimo_openai_compat():
                self.model = "mimo-v2-omni"
            else:
                self.model = "gpt-4o"
        self.text_analyzer = TextAnalyzer()
        self.image_analyzer = ImageAnalyzer()
        self.baseline_comparator = BaselineComparator()

    async def run(
        self,
        title: str,
        content: str,
        category: str,
        tags: list[str],
        cover_image: Optional[bytes] = None,
        video_analysis: Optional[dict] = None,
    ) -> dict:
        t0 = time.time()

        # --- Step 1: 多模态内容解析 ---
        title_analysis = self.text_analyzer.analyze_title(title)
        content_analysis = self.text_analyzer.analyze_content(content)

        image_analysis = None
        if cover_image:
            image_analysis = self.image_analyzer.analyze(cover_image)

        logger.info("解析耗时 %.1fs", time.time() - t0)

        # --- Step 2: Baseline 对比 ---
        note_features = {
            "title_length": title_analysis["length"],
            "tag_count": len(tags),
            "tags": tags,
        }
        if image_analysis:
            note_features.update({
                "saturation": image_analysis.get("saturation", 0),
                "text_ratio": image_analysis.get("text_ratio", 0),
                "has_face": image_analysis.get("has_face", False),
            })
        elif video_analysis:
            note_features.update({
                "has_face": bool(video_analysis.get("has_face", False)),
            })

        baseline_comparison = self.baseline_comparator.compare(category, note_features)

        # --- Step 3: 并行 Agent 诊断（Round 1）---
        t1 = time.time()
        content_agent = ContentAgent(model=MODEL_PRO)
        visual_agent = VisualAgent(model=MODEL_PRO)
        growth_agent = GrowthAgent(model=MODEL_PRO)
        user_sim_agent = UserSimAgent(model=MODEL_PRO)

        round1_tasks = [
            content_agent.diagnose(
                title=title, content=content, category=category,
                title_analysis=title_analysis, content_analysis=content_analysis,
                baseline_comparison=baseline_comparison,
            ),
            visual_agent.diagnose(
                title=title, category=category,
                image_analysis=image_analysis,
                video_analysis=video_analysis,
                baseline_comparison=baseline_comparison,
            ),
            growth_agent.diagnose(
                title=title, content=content, category=category,
                tags=tags, baseline_comparison=baseline_comparison,
            ),
            user_sim_agent.diagnose(
                title=title, content=content, category=category, tags=tags,
            ),
        ]

        opinions = await asyncio.gather(*round1_tasks, return_exceptions=True)
        agent_opinions = []
        round1_tokens = 0
        for op in opinions:
            if isinstance(op, Exception):
                agent_opinions.append({
                    "agent_name": "Unknown", "dimension": "error", "score": 0,
                    "issues": [str(op)], "suggestions": [], "reasoning": str(op),
                })
            else:
                meta = op.pop("_meta", None)
                if meta:
                    round1_tokens += meta.get("total_tokens", 0)
                    logger.info("  [%s] tokens=%d", op.get("agent_name", "?"), meta.get("total_tokens", 0))
                agent_opinions.append(op)

        logger.info("Round 1 诊断耗时 %.1fs，tokens=%d", time.time() - t1, round1_tokens)

        # --- Step 4: Agent 辩论（Round 2）---
        t2 = time.time()
        agents_list = [content_agent, visual_agent, growth_agent, user_sim_agent]
        debate_records, debate_tokens = await self._run_debate(agent_opinions, agents_list)
        logger.info("辩论耗时 %.1fs，tokens=%d", time.time() - t2, debate_tokens)

        # --- Step 5: 综合裁判 ---
        t3 = time.time()
        judge = JudgeAgent(model=MODEL_PRO)
        final_report = await judge.diagnose(
            title=title, category=category,
            agent_opinions=agent_opinions, debate_records=debate_records,
        )
        judge_meta = final_report.pop("_meta", None)
        judge_tokens = judge_meta.get("total_tokens", 0) if judge_meta else 0
        logger.info("裁判耗时 %.1fs，tokens=%d", time.time() - t3, judge_tokens)

        # --- Step 6: 组装响应 ---
        simulated_comments = []
        for op in agent_opinions:
            if "simulated_comments" in op:
                simulated_comments = op["simulated_comments"]
                break

        debate_timeline = self._build_debate_timeline(debate_records)

        total_time = time.time() - t0
        logger.info("诊断完成 | 总耗时=%.1fs | 总tokens≈%d",
                     total_time, round1_tokens + debate_tokens + judge_tokens)

        return self._assemble_response(
            final_report, agent_opinions, simulated_comments, debate_timeline
        )

    async def _run_debate(self, opinions: list[dict], agents: list) -> tuple[list[dict], int]:
        debate_tasks = []
        for i, agent in enumerate(agents):
            other_opinions = [op for j, op in enumerate(opinions) if j != i]
            other_text = json.dumps(other_opinions, ensure_ascii=False, indent=2)
            prompt = DEBATE_PROMPT.format(
                agent_name=agent.agent_name, other_opinions=other_text,
            )
            debate_tasks.append(agent.call_llm(prompt, system_override=agent.system_prompt))

        results = await asyncio.gather(*debate_tasks, return_exceptions=True)
        debate_records = []
        debate_tokens = 0
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("Agent %s 辩论异常: %s", agents[i].agent_name, result)
                continue
            meta = result.pop("_meta", None)
            if meta:
                debate_tokens += meta.get("total_tokens", 0)
            result["agent_name"] = agents[i].agent_name
            debate_records.append(result)

        return debate_records, debate_tokens

    def _build_debate_timeline(self, debate_records: list[dict]) -> list[dict]:
        timeline = []
        for record in debate_records:
            name = record.get("agent_name", "")
            for text in record.get("agreements", []):
                timeline.append({"round": 2, "agent_name": name, "kind": "agree", "text": text})
            for text in record.get("disagreements", []):
                timeline.append({"round": 2, "agent_name": name, "kind": "rebuttal", "text": text})
            for text in record.get("additions", []):
                timeline.append({"round": 2, "agent_name": name, "kind": "add", "text": text})
        return timeline

    def _assemble_response(self, final_report, agent_opinions, simulated_comments, debate_timeline) -> dict:
        radar = final_report.get("radar_data", {})
        is_llm_error = final_report.get("dimension") == "error"
        if not radar:
            scores = {op.get("dimension", "unknown"): op.get("score", 0) for op in agent_opinions}
            radar = {
                "content": scores.get("内容质量", 50),
                "visual": scores.get("视觉表现", 50),
                "growth": scores.get("增长策略", 50),
                "user_reaction": scores.get("用户反应", 50),
                "overall": final_report.get("overall_score", 50),
            }

        if is_llm_error and final_report.get("overall_score") is None:
            overall_score = float(final_report.get("score", 0))
        else:
            overall_score = float(final_report.get("overall_score", 50))
        grade = final_report.get("grade") if not is_llm_error else "D"
        if not grade:
            grade = self._calc_grade(overall_score)

        formatted_opinions = []
        for op in agent_opinions:
            formatted_opinions.append({
                "agent_name": op.get("agent_name", ""),
                "dimension": op.get("dimension", ""),
                "score": op.get("score", 0),
                "issues": op.get("issues", []),
                "suggestions": op.get("suggestions", []),
                "reasoning": op.get("reasoning", ""),
                "debate_comments": op.get("debate_comments", []),
            })

        formatted_comments = []
        for c in simulated_comments:
            if isinstance(c, dict):
                formatted_comments.append({
                    "username": c.get("username", "小红薯用户"),
                    "avatar_emoji": c.get("avatar_emoji", "😊"),
                    "comment": c.get("comment", ""),
                    "sentiment": c.get("sentiment", "neutral"),
                })

        cover_dir = final_report.get("cover_direction")
        if cover_dir is not None and not isinstance(cover_dir, dict):
            cover_dir = None

        issues = _normalize_issues_items(final_report.get("issues", []))
        suggestions = _normalize_suggestions_items(final_report.get("suggestions", []))
        if is_llm_error and not suggestions:
            suggestions = _normalize_suggestions_items([
                "无法连接大模型服务，请检查网络、代理与 OPENAI_BASE_URL / API Key 配置后重试。",
            ])

        debate_summary = final_report.get("debate_summary", "")
        if is_llm_error and not debate_summary:
            debate_summary = final_report.get("reasoning", "") or "大模型调用失败，未完成 Agent 辩论与综合裁判。"

        return {
            "overall_score": overall_score,
            "grade": grade,
            "radar_data": radar,
            "agent_opinions": formatted_opinions,
            "issues": issues,
            "suggestions": suggestions,
            "debate_summary": debate_summary,
            "debate_timeline": debate_timeline,
            "simulated_comments": formatted_comments,
            "optimized_title": final_report.get("optimized_title"),
            "optimized_content": final_report.get("optimized_content"),
            "cover_direction": cover_dir,
        }

    def _calc_grade(self, score: float) -> str:
        if score >= 90: return "S"
        if score >= 75: return "A"
        if score >= 60: return "B"
        if score >= 40: return "C"
        return "D"
