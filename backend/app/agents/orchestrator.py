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
from typing import Optional, Callable, Awaitable, Any

from app.analysis.text_analyzer import TextAnalyzer
from app.analysis.image_analyzer import ImageAnalyzer
from app.baseline.comparator import BaselineComparator
from app.agents.base_agent import MODEL_PRO, MODEL_FAST
from app.agents.research_data import pre_score
from app.agents.content_agent import ContentAgent
from app.agents.visual_agent import VisualAgent
from app.agents.growth_agent import GrowthAgent
from app.agents.user_sim_agent import UserSimAgent
from app.agents.judge_agent import JudgeAgent
from app.agents.base_agent import _is_mimo_openai_compat
from app.agents.prompts.debate import DEBATE_PROMPT

logger = logging.getLogger("noterx.orchestrator")


def _clamp_score(value: float) -> float:
    """Clamp to 0-100 and round to 1 decimal."""
    return round(min(max(value, 0.0), 100.0), 1)


def _build_stable_scores(
    model_a_score: dict,
    content_analysis: dict,
    image_analysis: dict | None,
    video_analysis: dict | None,
) -> dict[str, float]:
    """
    从 Model A 预评分 + 文本/图像分析构建确定性雷达分数。
    不依赖 LLM 输出 → 同一输入永远产出相同分数（from PR #64）。
    """
    dims = model_a_score.get("dimensions", {})
    title_quality = float(dims.get("title_quality", 50))
    content_quality = float(dims.get("content_quality", 50))
    visual_quality = float(dims.get("visual_quality", 50))
    tag_strategy = float(dims.get("tag_strategy", 50))
    engagement_potential = float(dims.get("engagement_potential", 50))

    readability = float(content_analysis.get("readability_score", 0))
    info_density = float(content_analysis.get("info_density", 0)) * 100
    content_score = _clamp_score(
        title_quality * 0.25 + content_quality * 0.55
        + readability * 0.12 + info_density * 0.08
    )

    if image_analysis:
        saturation = float(image_analysis.get("saturation", 0)) * 100
        text_ratio = float(image_analysis.get("text_ratio", 0))
        text_balance = max(0.0, 100.0 - abs(text_ratio - 0.22) * 260.0)
        face_seen = bool(image_analysis.get("has_face")) or bool((video_analysis or {}).get("has_face"))
        face_bonus = 8.0 if face_seen else 0.0
        visual_score = _clamp_score(
            visual_quality * 0.7 + saturation * 0.15
            + text_balance * 0.15 + face_bonus
        )
    elif video_analysis:
        face_bonus = 8.0 if video_analysis.get("has_face") else 0.0
        visual_score = _clamp_score(visual_quality * 0.85 + 10.0 + face_bonus)
    else:
        visual_score = _clamp_score(visual_quality)

    # Growth不应只看标签，engagement_potential(互动潜力)权重提高
    # 好内容本身就有增长潜力，标签只是锦上添花
    growth_score = _clamp_score(tag_strategy * 0.35 + engagement_potential * 0.45 + content_quality * 0.20)
    user_reaction_score = _clamp_score(
        content_score * 0.35 + visual_score * 0.2 + growth_score * 0.45
    )
    # Overall: 综合各维度平均，不直接用 model_a（model_a 偏乐观）
    raw_overall = (content_score + visual_score + growth_score + user_reaction_score) / 4
    model_a_overall = float(model_a_score.get("total_score", 50))
    # 取两者加权平均，model_a 占40%，维度平均占60%（抑制过高分）
    overall_score = _clamp_score(model_a_overall * 0.4 + raw_overall * 0.6)

    return {
        "content": content_score,
        "visual": visual_score,
        "growth": growth_score,
        "user_reaction": user_reaction_score,
        "overall": overall_score,
    }


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
            except Exception as e:
                logger.warning("progress callback failed (%s): %s", step, e)

        agent_timeout = float(os.getenv("AGENT_LLM_TIMEOUT_SEC", "90"))
        judge_timeout = float(os.getenv("JUDGE_LLM_TIMEOUT_SEC", "180"))
        debate_timeout = float(os.getenv("DEBATE_LLM_TIMEOUT_SEC", "90"))

        # --- Step 1: 多模态内容解析 ---
        await _emit_progress("parse_start", "正在解析标题、正文与基础素材...")
        title_analysis = self.text_analyzer.analyze_title(title)
        content_analysis = self.text_analyzer.analyze_content(content)

        image_analysis = None
        if cover_image:
            image_analysis = await asyncio.to_thread(self.image_analyzer.analyze, cover_image)
            logger.info(
                "cover_image: bytes=%d cv_size=%sx%s",
                len(cover_image),
                image_analysis.get("width"),
                image_analysis.get("height"),
            )

        logger.info("解析耗时 %.1fs", time.time() - t0)
        await _emit_progress("parse_done", "内容与素材解析完成")

        # --- Step 2: Baseline 对比 ---
        await _emit_progress("baseline_start", "正在进行同类基线对比与预评分...")
        note_features = {
            "title_length": title_analysis["length"],
            "tag_count": len(tags),
            "tags": tags,
        }
        if image_analysis:
            face_seen = bool(image_analysis.get("has_face")) or bool((video_analysis or {}).get("has_face"))
            note_features.update({
                "saturation": image_analysis.get("saturation", 0),
                "text_ratio": image_analysis.get("text_ratio", 0),
                "has_face": face_seen,
            })
        elif video_analysis:
            note_features.update({
                "has_face": bool(video_analysis.get("has_face", False)),
            })

        baseline_comparison = self.baseline_comparator.compare(category, note_features)

        # --- Step 2.5: Model A 预评分 ---
        model_a_score = pre_score(
            title=title,
            content=content,
            category=category,
            tag_count=len(tags),
            image_count=1 if (image_analysis or video_analysis) else 0,
        )
        baseline_comparison["model_a_pre_score"] = model_a_score
        # 确定性雷达分数（不依赖LLM，同一输入永远相同）
        stable_scores = _build_stable_scores(
            model_a_score=model_a_score,
            content_analysis=content_analysis,
            image_analysis=image_analysis,
            video_analysis=video_analysis,
        )
        logger.info("Model A 预评分: %.1f (%s), stable_scores=%s", model_a_score["total_score"], model_a_score["level"], stable_scores)
        await _emit_progress("baseline_done", "基线对比完成，开始专家诊断")

        # --- Step 3: 并行 Agent 诊断（Round 1）---
        await _emit_progress("round1_start", "4位专家正在并行诊断...")
        t1 = time.time()
        content_agent = ContentAgent(model=MODEL_PRO)
        visual_agent = VisualAgent(model=MODEL_PRO)
        growth_agent = GrowthAgent(model=MODEL_PRO)
        user_sim_agent = UserSimAgent(model=MODEL_PRO)

        async def _run_round1_agent(label: str, coro):
            try:
                return await asyncio.wait_for(coro, timeout=agent_timeout)
            except asyncio.TimeoutError:
                logger.warning("Round1 %s 超时 (%.0fs)", label, agent_timeout)
                return Exception(f"{label} 调用超时（{int(agent_timeout)}s）")
            except Exception as e:
                logger.warning("Round1 %s 异常: %s", label, e)
                return e

        round1_tasks = [
            _run_round1_agent(
                "内容分析师",
                content_agent.diagnose(
                    title=title, content=content, category=category,
                    title_analysis=title_analysis, content_analysis=content_analysis,
                    baseline_comparison=baseline_comparison,
                ),
            ),
            _run_round1_agent(
                "视觉诊断师",
                visual_agent.diagnose(
                    title=title, category=category,
                    image_analysis=image_analysis,
                    video_analysis=video_analysis,
                    baseline_comparison=baseline_comparison,
                    cover_image_bytes=cover_image,
                ),
            ),
            _run_round1_agent(
                "增长策略师",
                growth_agent.diagnose(
                    title=title, content=content, category=category,
                    tags=tags, baseline_comparison=baseline_comparison,
                ),
            ),
            _run_round1_agent(
                "用户模拟器",
                user_sim_agent.diagnose(
                    title=title, content=content, category=category, tags=tags,
                ),
            ),
        ]

        opinions = await asyncio.gather(*round1_tasks, return_exceptions=True)
        agent_opinions = []
        round1_tokens = 0
        round1_step_keys = [
            "round1_content_done",
            "round1_visual_done",
            "round1_growth_done",
            "round1_user_done",
        ]
        round1_step_msgs = [
            "内容分析师诊断完成",
            "视觉诊断师诊断完成",
            "增长策略师诊断完成",
            "用户模拟器诊断完成",
        ]

        for idx, op in enumerate(opinions):
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
            if idx < len(round1_step_keys):
                await _emit_progress(round1_step_keys[idx], round1_step_msgs[idx])

        logger.info("Round 1 诊断耗时 %.1fs，tokens=%d", time.time() - t1, round1_tokens)
        await _emit_progress("round1_done", "专家诊断完成，进入辩论环节")

        # --- Step 4+5: 辩论 + 裁判并行 ---
        await _emit_progress("debate_start", "专家辩论与综合裁判同步进行...")
        t2 = time.time()
        agents_list = [content_agent, visual_agent, growth_agent, user_sim_agent]

        # 辩论和裁判并行，但各自完成时立即发进度事件
        judge = JudgeAgent(model=MODEL_PRO)

        debate_records: list[dict] = []
        debate_tokens = 0
        final_report: dict = {}
        judge_tokens = 0

        async def _debate_task():
            nonlocal debate_records, debate_tokens
            try:
                debate_records, debate_tokens = await self._run_debate(
                    agent_opinions,
                    agents_list,
                    progress_cb=_emit_progress,
                    debate_timeout_sec=debate_timeout,
                )
            except Exception as e:
                logger.warning("辩论异常: %s", e)
            await _emit_progress("debate_done", "专家辩论完成")

        async def _judge_task():
            nonlocal final_report, judge_tokens
            await _emit_progress("judge_start", "综合裁判正在评定...")
            try:
                result = await asyncio.wait_for(
                    judge.diagnose(
                        title=title, category=category,
                        agent_opinions=agent_opinions, debate_records=None,
                    ),
                    timeout=judge_timeout,
                )
                final_report = result
                meta = final_report.pop("_meta", None)
                judge_tokens = meta.get("total_tokens", 0) if meta else 0
            except asyncio.TimeoutError:
                logger.error("裁判超时 (%.0fs)", judge_timeout)
                final_report = {
                    "overall_score": 50, "grade": "C",
                    "issues": [{
                        "severity": "high",
                        "description": f"综合裁判超时（{int(judge_timeout)}s）",
                        "from_agent": "system",
                    }],
                    "suggestions": [], "debate_summary": "裁判超时，已使用占位结果",
                }
            except Exception as e:
                logger.error("裁判异常: %s", e)
                final_report = {"overall_score": 50, "grade": "C", "issues": [{"severity": "high", "description": str(e), "from_agent": "system"}], "suggestions": [], "debate_summary": "裁判失败"}
            await _emit_progress("judge_done", "裁判评定完成")

        await asyncio.gather(_debate_task(), _judge_task())

        logger.info("辩论+裁判并行耗时 %.1fs，debate_tokens=%d, judge_tokens=%d",
                     time.time() - t2, debate_tokens, judge_tokens)

        # --- Step 6: 组装响应 ---
        await _emit_progress("finalizing", "正在生成最终诊断报告...")
        simulated_comments = []
        for op in agent_opinions:
            if "simulated_comments" in op:
                simulated_comments = op["simulated_comments"]
                break

        debate_timeline = self._build_debate_timeline(debate_records)

        total_time = time.time() - t0
        logger.info("诊断完成 | 总耗时=%.1fs | 总tokens≈%d",
                     total_time, round1_tokens + debate_tokens + judge_tokens)

        result = self._assemble_response(
            final_report, agent_opinions, simulated_comments, debate_timeline,
            stable_scores=stable_scores,
        )
        result["model_a_pre_score"] = model_a_score
        result["_usage"] = {
            "total_tokens": round1_tokens + debate_tokens + judge_tokens,
            "duration_sec": round(total_time, 1),
        }
        return result

    async def _run_debate(
        self,
        opinions: list[dict],
        agents: list,
        progress_cb=None,
        debate_timeout_sec: float = 90.0,
    ) -> tuple[list[dict], int]:
        """辩论环节：4个Agent依次发言，每个完成后发送进度事件。"""
        agent_names = ["内容专家", "视觉专家", "增长顾问", "用户模拟"]
        debate_records = []
        debate_tokens = 0

        # Build all prompts first
        prompts = []
        for i, agent in enumerate(agents):
            other_opinions = []
            for j, op in enumerate(opinions):
                if j != i:
                    other_opinions.append({
                        "agent_name": op.get("agent_name", ""),
                        "dimension": op.get("dimension", ""),
                        "score": op.get("score", 0),
                        "issues": op.get("issues", [])[:3],
                        "suggestions": op.get("suggestions", [])[:3],
                    })
            other_text = json.dumps(other_opinions, ensure_ascii=False)
            prompts.append(DEBATE_PROMPT.format(
                agent_name=agent.agent_name, other_opinions=other_text,
            ))

        # Run all 4 in parallel but emit progress as each completes（单席超时避免整盘挂死）
        async def _single_debate(idx):
            try:
                result = await asyncio.wait_for(
                    agents[idx].call_llm(
                        prompts[idx], system_override=agents[idx].system_prompt,
                        model_override=MODEL_FAST, max_tokens=1024,
                    ),
                    timeout=debate_timeout_sec,
                )
                return idx, result
            except asyncio.TimeoutError:
                logger.warning("辩论 agent[%d] 超时 (%.0fs)", idx, debate_timeout_sec)
                return idx, {
                    "agent_name": agents[idx].agent_name,
                    "agreements": [],
                    "disagreements": [f"该专家发言超时（{int(debate_timeout_sec)}s），已跳过"],
                    "additions": [],
                }
            except Exception as e:
                logger.warning("辩论 agent[%d] 失败: %s", idx, e)
                return idx, {
                    "agent_name": agents[idx].agent_name,
                    "agreements": [],
                    "disagreements": [str(e)],
                    "additions": [],
                }

        tasks = [asyncio.create_task(_single_debate(i)) for i in range(len(agents))]
        for coro in asyncio.as_completed(tasks):
            try:
                idx, result = await coro
            except Exception as e:
                logger.warning("辩论异常: %s", e)
                continue
            if isinstance(result, dict):
                meta = result.pop("_meta", None)
                if meta:
                    debate_tokens += meta.get("total_tokens", 0)
                result["agent_name"] = agents[idx].agent_name
                debate_records.append(result)
                # Emit progress with debate preview text
                name = agent_names[idx] if idx < len(agent_names) else agents[idx].agent_name
                # Pick the most interesting snippet: first disagreement > addition > agreement
                snippets = (result.get("disagreements") or []) + (result.get("additions") or []) + (result.get("agreements") or [])
                preview = snippets[0][:80] if snippets else f"{name}完成发言"
                if progress_cb:
                    try:
                        ret = progress_cb(f"debate_agent_{idx}", f"{name}：{preview}")
                        if asyncio.iscoroutine(ret):
                            await ret
                    except Exception:
                        pass

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

    def _assemble_response(self, final_report, agent_opinions, simulated_comments, debate_timeline, stable_scores=None) -> dict:
        is_llm_error = final_report.get("dimension") == "error"

        # 使用确定性 stable_scores 作为雷达分数（不依赖 LLM 输出，#52 评分稳定性）
        if stable_scores:
            radar = {k: _clamp_score(v) for k, v in stable_scores.items()}
        else:
            radar = final_report.get("radar_data", {})
            if not radar:
                scores = {op.get("dimension", "unknown"): op.get("score", 0) for op in agent_opinions}
                radar = {
                    "content": scores.get("内容质量", 50),
                    "visual": scores.get("视觉表现", 50),
                    "growth": scores.get("增长策略", 50),
                    "user_reaction": scores.get("用户反应", 50),
                    "overall": final_report.get("overall_score", 50),
                }
            for k in radar:
                radar[k] = round(max(0, min(100, float(radar[k]))))

        if is_llm_error and final_report.get("overall_score") is None:
            overall_score = float(final_report.get("score", 0))
        else:
            overall_score = float(final_report.get("overall_score", 50))
        # Use stable overall if available
        if stable_scores:
            overall_score = round(stable_scores.get("overall", overall_score))
        else:
            overall_score = round(max(0, min(100, overall_score)))
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
                    "likes": int(c.get("likes", 0)) if c.get("likes") is not None else 0,
                })

        cover_dir = final_report.get("cover_direction")
        if cover_dir is not None and not isinstance(cover_dir, dict):
            cover_dir = None

        issues = _normalize_issues_items(final_report.get("issues", []))
        # Fallback: 如果 Judge 没返回 issues，从各 Agent 汇总
        if not issues and not is_llm_error:
            agent_iss: list = []
            for op in agent_opinions:
                for iss in (op.get("issues") or [])[:2]:
                    agent_iss.append(iss)
            issues = _normalize_issues_items(agent_iss[:6])
        suggestions = _normalize_suggestions_items(final_report.get("suggestions", []))
        # Fallback: 如果 Judge 没返回 suggestions，从各 Agent 的 suggestions 汇总
        if not suggestions and not is_llm_error:
            agent_sug: list = []
            for op in agent_opinions:
                for s in (op.get("suggestions") or [])[:2]:
                    agent_sug.append(s)
            suggestions = _normalize_suggestions_items(agent_sug[:6])
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
