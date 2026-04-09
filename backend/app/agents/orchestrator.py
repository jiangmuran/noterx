"""
Main orchestration for note diagnosis.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Awaitable, Callable, Optional

from app.agents.base_agent import MODEL_FAST, MODEL_PRO, _is_mimo_openai_compat
from app.agents.content_agent import ContentAgent
from app.agents.growth_agent import GrowthAgent
from app.agents.judge_agent import JudgeAgent
from app.agents.prompts.debate import DEBATE_PROMPT
from app.agents.research_data import pre_score
from app.agents.user_sim_agent import UserSimAgent
from app.agents.visual_agent import VisualAgent
from app.analysis.image_analyzer import ImageAnalyzer
from app.analysis.text_analyzer import TextAnalyzer
from app.baseline.comparator import BaselineComparator

logger = logging.getLogger("noterx.orchestrator")


def _clamp_score(value: float) -> float:
    return round(min(max(value, 0.0), 100.0), 1)


def _build_stable_scores(
    model_a_score: dict,
    content_analysis: dict,
    image_analysis: dict | None,
    video_analysis: dict | None,
) -> dict[str, float]:
    dims = model_a_score.get("dimensions", {})
    title_quality = float(dims.get("title_quality", 50))
    content_quality = float(dims.get("content_quality", 50))
    visual_quality = float(dims.get("visual_quality", 50))
    tag_strategy = float(dims.get("tag_strategy", 50))
    engagement_potential = float(dims.get("engagement_potential", 50))

    readability = float(content_analysis.get("readability_score", 0))
    info_density = float(content_analysis.get("info_density", 0)) * 100
    content_score = _clamp_score(
        title_quality * 0.25
        + content_quality * 0.55
        + readability * 0.12
        + info_density * 0.08
    )

    if image_analysis:
        saturation = float(image_analysis.get("saturation", 0)) * 100
        text_ratio = float(image_analysis.get("text_ratio", 0))
        text_balance = max(0.0, 100.0 - abs(text_ratio - 0.22) * 260.0)
        face_bonus = 8.0 if image_analysis.get("has_face") else 0.0
        visual_score = _clamp_score(
            visual_quality * 0.7
            + saturation * 0.15
            + text_balance * 0.15
            + face_bonus
        )
    elif video_analysis:
        face_bonus = 8.0 if video_analysis.get("has_face") else 0.0
        visual_score = _clamp_score(visual_quality * 0.85 + 10.0 + face_bonus)
    else:
        visual_score = _clamp_score(visual_quality)

    growth_score = _clamp_score(tag_strategy * 0.55 + engagement_potential * 0.45)
    user_reaction_score = _clamp_score(
        content_score * 0.35
        + visual_score * 0.2
        + growth_score * 0.45
    )
    overall_score = _clamp_score(float(model_a_score.get("total_score", 50)))

    return {
        "content": content_score,
        "visual": visual_score,
        "growth": growth_score,
        "user_reaction": user_reaction_score,
        "overall": overall_score,
    }


def _normalize_issues_items(raw: list | None) -> list[dict]:
    out: list[dict] = []
    for item in raw or []:
        if isinstance(item, dict):
            description = item.get("description") or item.get("msg") or ""
            row = {**item, "description": description or str(item)}
            row.setdefault("severity", "high")
            row.setdefault("from_agent", row.get("from_agent") or "")
            out.append(row)
        else:
            out.append(
                {
                    "severity": "high",
                    "description": str(item),
                    "from_agent": "system",
                }
            )
    return out


def _normalize_suggestions_items(raw: list | None) -> list[dict]:
    out: list[dict] = []
    for item in raw or []:
        if isinstance(item, dict):
            out.append(
                {
                    "priority": int(item.get("priority", 1)),
                    "description": str(item.get("description", "")),
                    "expected_impact": str(item.get("expected_impact", "")),
                }
            )
        else:
            out.append(
                {
                    "priority": 1,
                    "description": str(item),
                    "expected_impact": "",
                }
            )
    return out


class Orchestrator:
    """Coordinate the full diagnosis pipeline."""

    def __init__(self, model: Optional[str] = None):
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
        image_count: int = 0,
        video_analysis: Optional[dict] = None,
        progress_cb: Optional[Callable[[str, str], Awaitable[Any] | Any]] = None,
    ) -> dict:
        t0 = time.time()

        async def _emit_progress(step: str, message: str) -> None:
            if progress_cb is None:
                return
            try:
                ret = progress_cb(step, message)
                if asyncio.iscoroutine(ret):
                    await ret
            except Exception as exc:
                logger.warning("progress callback failed (%s): %s", step, exc)

        await _emit_progress("parse_start", "Parsing note content...")
        title_analysis = self.text_analyzer.analyze_title(title)
        content_analysis = self.text_analyzer.analyze_content(content)

        image_analysis = None
        if cover_image:
            image_analysis = self.image_analyzer.analyze(cover_image)

        logger.info("Parse finished in %.1fs", time.time() - t0)
        await _emit_progress("parse_done", "Content parsing complete.")

        await _emit_progress("baseline_start", "Comparing against category baseline...")
        note_features = {
            "title_length": title_analysis["length"],
            "tag_count": len(tags),
            "tags": tags,
        }
        if image_analysis:
            note_features.update(
                {
                    "saturation": image_analysis.get("saturation", 0),
                    "text_ratio": image_analysis.get("text_ratio", 0),
                    "has_face": image_analysis.get("has_face", False),
                }
            )
        elif video_analysis:
            note_features.update({"has_face": bool(video_analysis.get("has_face", False))})

        baseline_comparison = self.baseline_comparator.compare(category, note_features)
        model_a_score = pre_score(
            title=title,
            content=content,
            category=category,
            tag_count=len(tags),
            image_count=max(image_count, 1 if image_analysis or video_analysis else 0),
        )
        baseline_comparison["model_a_pre_score"] = model_a_score
        stable_scores = _build_stable_scores(
            model_a_score=model_a_score,
            content_analysis=content_analysis,
            image_analysis=image_analysis,
            video_analysis=video_analysis,
        )
        logger.info(
            "Model A pre-score %.1f (%s)",
            model_a_score["total_score"],
            model_a_score["level"],
        )
        await _emit_progress("baseline_done", "Baseline comparison complete.")

        await _emit_progress("round1_start", "Running specialist diagnosis...")
        t1 = time.time()
        content_agent = ContentAgent(model=MODEL_PRO)
        visual_agent = VisualAgent(model=MODEL_PRO)
        growth_agent = GrowthAgent(model=MODEL_PRO)
        user_sim_agent = UserSimAgent(model=MODEL_PRO)

        round1_tasks = [
            content_agent.diagnose(
                title=title,
                content=content,
                category=category,
                title_analysis=title_analysis,
                content_analysis=content_analysis,
                baseline_comparison=baseline_comparison,
            ),
            visual_agent.diagnose(
                title=title,
                category=category,
                image_analysis=image_analysis,
                video_analysis=video_analysis,
                baseline_comparison=baseline_comparison,
            ),
            growth_agent.diagnose(
                title=title,
                content=content,
                category=category,
                tags=tags,
                baseline_comparison=baseline_comparison,
            ),
            user_sim_agent.diagnose(
                title=title,
                content=content,
                category=category,
                tags=tags,
            ),
        ]

        opinions = await asyncio.gather(*round1_tasks, return_exceptions=True)
        agent_opinions: list[dict] = []
        round1_tokens = 0
        round1_step_keys = [
            "round1_content_done",
            "round1_visual_done",
            "round1_growth_done",
            "round1_user_done",
        ]
        round1_role_keys = [
            "content",
            "visual",
            "growth",
            "user_reaction",
        ]
        round1_step_msgs = [
            "Content diagnosis complete.",
            "Visual diagnosis complete.",
            "Growth diagnosis complete.",
            "User simulation complete.",
        ]

        for idx, opinion in enumerate(opinions):
            if isinstance(opinion, Exception):
                agent_opinions.append(
                    {
                        "agent_name": "Unknown",
                        "dimension": "error",
                        "score": 0,
                        "issues": [str(opinion)],
                        "suggestions": [],
                        "reasoning": str(opinion),
                    }
                )
            else:
                meta = opinion.pop("_meta", None)
                if meta:
                    round1_tokens += meta.get("total_tokens", 0)
                    logger.info(
                        "  [%s] tokens=%d",
                        opinion.get("agent_name", "?"),
                        meta.get("total_tokens", 0),
                    )
                if idx < len(round1_role_keys):
                    opinion["_role_key"] = round1_role_keys[idx]
                agent_opinions.append(opinion)
            if idx < len(round1_step_keys):
                await _emit_progress(round1_step_keys[idx], round1_step_msgs[idx])

        logger.info("Round 1 finished in %.1fs, tokens=%d", time.time() - t1, round1_tokens)
        await _emit_progress("round1_done", "Specialist diagnosis complete.")

        await _emit_progress("debate_start", "Running debate and final judgement...")
        t2 = time.time()
        agents_list = [content_agent, visual_agent, growth_agent, user_sim_agent]
        judge = JudgeAgent(model=MODEL_PRO)

        async def _debate_task():
            return await self._run_debate(agent_opinions, agents_list)

        async def _judge_task():
            return await judge.diagnose(
                title=title,
                category=category,
                agent_opinions=agent_opinions,
                debate_records=None,
            )

        debate_result, judge_result = await asyncio.gather(
            _debate_task(),
            _judge_task(),
            return_exceptions=True,
        )

        debate_records: list[dict] = []
        debate_tokens = 0
        if not isinstance(debate_result, Exception):
            debate_records, debate_tokens = debate_result
        else:
            logger.warning("Debate failed and was skipped: %s", debate_result)

        if isinstance(judge_result, Exception):
            logger.error("Judge failed: %s", judge_result)
            final_report = {
                "overall_score": 50,
                "grade": "C",
                "issues": [
                    {
                        "severity": "high",
                        "description": str(judge_result),
                        "from_agent": "system",
                    }
                ],
                "suggestions": [],
                "debate_summary": "Judge step failed.",
            }
        else:
            final_report = judge_result

        judge_meta = final_report.pop("_meta", None)
        judge_tokens = judge_meta.get("total_tokens", 0) if judge_meta else 0
        logger.info(
            "Debate + judge finished in %.1fs, debate_tokens=%d, judge_tokens=%d",
            time.time() - t2,
            debate_tokens,
            judge_tokens,
        )
        await _emit_progress("judge_done", "Judgement complete.")

        await _emit_progress("finalizing", "Finalizing report...")
        simulated_comments = []
        for opinion in agent_opinions:
            if "simulated_comments" in opinion:
                simulated_comments = opinion["simulated_comments"]
                break

        debate_timeline = self._build_debate_timeline(debate_records)

        logger.info(
            "Diagnosis completed in %.1fs, total_tokens=%d",
            time.time() - t0,
            round1_tokens + debate_tokens + judge_tokens,
        )

        result = self._assemble_response(
            final_report=final_report,
            agent_opinions=agent_opinions,
            simulated_comments=simulated_comments,
            debate_timeline=debate_timeline,
            stable_scores=stable_scores,
        )
        result["model_a_pre_score"] = model_a_score
        return result

    async def _run_debate(self, opinions: list[dict], agents: list) -> tuple[list[dict], int]:
        debate_tasks = []
        for index, agent in enumerate(agents):
            other_opinions = []
            for other_index, opinion in enumerate(opinions):
                if other_index != index:
                    other_opinions.append(
                        {
                            "agent_name": opinion.get("agent_name", ""),
                            "dimension": opinion.get("dimension", ""),
                            "score": opinion.get("score", 0),
                            "issues": opinion.get("issues", [])[:3],
                            "suggestions": opinion.get("suggestions", [])[:3],
                        }
                    )
            other_text = json.dumps(other_opinions, ensure_ascii=False)
            prompt = DEBATE_PROMPT.format(
                agent_name=agent.agent_name,
                other_opinions=other_text,
            )
            debate_tasks.append(
                agent.call_llm(
                    prompt,
                    system_override=agent.system_prompt,
                    model_override=MODEL_FAST,
                    max_tokens=1024,
                )
            )

        results = await asyncio.gather(*debate_tasks, return_exceptions=True)
        debate_records = []
        debate_tokens = 0
        for index, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("Agent %s debate failed: %s", agents[index].agent_name, result)
                continue
            meta = result.pop("_meta", None)
            if meta:
                debate_tokens += meta.get("total_tokens", 0)
            result["agent_name"] = agents[index].agent_name
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

    def _assemble_response(
        self,
        final_report: dict,
        agent_opinions: list[dict],
        simulated_comments: list,
        debate_timeline: list[dict],
        stable_scores: dict[str, float],
    ) -> dict:
        radar = {
            "content": stable_scores["content"],
            "visual": stable_scores["visual"],
            "growth": stable_scores["growth"],
            "user_reaction": stable_scores["user_reaction"],
            "overall": stable_scores["overall"],
        }
        is_llm_error = final_report.get("dimension") == "error"
        overall_score = stable_scores["overall"]
        grade = self._calc_grade(overall_score)

        formatted_opinions = []
        for opinion in agent_opinions:
            role_key = opinion.get("_role_key")
            formatted_opinions.append(
                {
                    "agent_name": opinion.get("agent_name", ""),
                    "dimension": opinion.get("dimension", ""),
                    "score": stable_scores.get(role_key, opinion.get("score", 0)),
                    "issues": opinion.get("issues", []),
                    "suggestions": opinion.get("suggestions", []),
                    "reasoning": opinion.get("reasoning", ""),
                    "debate_comments": opinion.get("debate_comments", []),
                }
            )

        formatted_comments = []
        for comment in simulated_comments:
            if isinstance(comment, dict):
                formatted_comments.append(
                    {
                        "username": comment.get("username", "User"),
                        "avatar_emoji": comment.get("avatar_emoji", "🙂"),
                        "comment": comment.get("comment", ""),
                        "sentiment": comment.get("sentiment", "neutral"),
                        "likes": int(comment.get("likes", 0)) if comment.get("likes") is not None else 0,
                    }
                )

        cover_direction = final_report.get("cover_direction")
        if cover_direction is not None and not isinstance(cover_direction, dict):
            cover_direction = None

        issues = _normalize_issues_items(final_report.get("issues", []))
        suggestions = _normalize_suggestions_items(final_report.get("suggestions", []))
        if is_llm_error and not suggestions:
            suggestions = _normalize_suggestions_items(
                [
                    "LLM service is unavailable. Check network, proxy, OPENAI_BASE_URL, and API key configuration.",
                ]
            )

        debate_summary = final_report.get("debate_summary", "")
        if is_llm_error and not debate_summary:
            debate_summary = final_report.get("reasoning", "") or "LLM request failed before debate and final judgement completed."

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
            "cover_direction": cover_direction,
        }

    def _calc_grade(self, score: float) -> str:
        if score >= 90:
            return "S"
        if score >= 75:
            return "A"
        if score >= 60:
            return "B"
        if score >= 40:
            return "C"
        return "D"
