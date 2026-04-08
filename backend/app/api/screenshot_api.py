"""
多维度截图上传 + AI 快速识别 + 全量深度分析 API
支持封面、正文、主页、评论区截图上传及视频录屏。
"""

import base64
import json
import logging
import os
import re
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.agents.base_agent import _get_client, _is_mimo_openai_compat

router = APIRouter()
logger = logging.getLogger("noterx.screenshot")

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_VIDEO_SIZE = 100 * 1024 * 1024
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/webm", "video/quicktime"}

SLOT_LABELS = {
    "cover": "封面截图",
    "content": "正文内容截图",
    "profile": "主页截图",
    "comments": "评论区截图",
}

_QUICK_PROMPT = """你是一个小红书内容理解助手，不是纯 OCR 抄写器。
任务目标：先理解截图的业务语义，再做结构化提取。

请按以下规则输出：
1) 判断截图类型：cover/content/profile/comments/other。
   - 只有当截图清晰展示“笔记详情页正文区域（标题+正文/标签）”时，才能判定为 content。
   - 如果只是封面图、主页、评论区、发布选择页、图片预览页，一律不要判定为 content。
2) 判断垂类 category（如穿搭、美食、数码、旅行、美妆、健身等）。
3) title/content_text 只提取“对诊断有用”的关键信息：
   - 能清晰看见就提取；
   - 看不清或不可见就返回空字符串；
   - 不要臆造、不要逐字硬抄整屏。
   - 当 slot_type 不是 content 时，title 和 content_text 必须都为空字符串。
   - 如果正文主要是标签（如 #话题A #话题B），这些标签应写入 content_text。
   - 若是发布页截图，优先提取标题下方文案和标签区，不要把评论区当正文。
4) summary 用 1-2 句概括“这张图对诊断的价值点”（例如情绪、卖点、互动信号、账号定位信号等）。
5) confidence 为你对本次识别可信度的估计（0~1）。

仅输出 JSON：
{"slot_type": "cover|content|profile|comments|other", "category": "类别", "title": "标题或空字符串", "content_text": "正文或空字符串", "summary": "摘要", "confidence": 0.0-1.0}"""

_DEEP_PROMPT_COVER = """分析这张封面截图的视觉吸引力，输出 JSON：
{"visual_score": 0-100, "color_scheme": "配色描述", "composition": "构图评价", "text_overlay": "文字覆盖率评价", "suggestions": ["建议1", "建议2"]}"""

_DEEP_PROMPT_CONTENT = """提取这张笔记正文截图中的关键信息，输出 JSON：
{"title": "标题", "content": "正文全文或要点", "tags": ["标签1"], "word_count": 数字, "readability": "可读性评价"}"""

_DEEP_PROMPT_PROFILE = """分析这张博主主页截图，输出 JSON：
{"nickname": "昵称", "follower_count": "粉丝数文本", "note_count": "笔记数", "bio": "简介", "account_level": "素人/腰部/头部", "niche": "垂类领域"}"""

_DEEP_PROMPT_COMMENTS = """分析这张评论区截图中的评论，输出 JSON：
{"comments": [{"text": "评论内容", "sentiment": "positive|negative|neutral"}], "overall_sentiment": "整体情感倾向", "engagement_quality": "互动质量评价", "top_concerns": ["热点话题1"]}"""

DEEP_PROMPTS = {
    "cover": _DEEP_PROMPT_COVER,
    "content": _DEEP_PROMPT_CONTENT,
    "profile": _DEEP_PROMPT_PROFILE,
    "comments": _DEEP_PROMPT_COMMENTS,
}

LINK_PATTERN = re.compile(r"https?://\S+", re.IGNORECASE)


def strip_links(text: str) -> str:
    """剔除文本中的所有 http/https 链接。"""
    return LINK_PATTERN.sub("", text).strip()


def _normalize_tags(tags: list[object]) -> str:
    cleaned: list[str] = []
    for tag in tags:
        t = str(tag).strip()
        if not t:
            continue
        cleaned.append(t if t.startswith("#") else f"#{t}")
    return " ".join(cleaned)


async def _vision_call(client, prompt: str, image_bytes: bytes) -> dict:
    """调用多模态模型进行图片分析。"""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    model = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")

    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请分析这张截图。"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                ],
            },
        ],
    }
    if _is_mimo_openai_compat():
        kwargs["max_completion_tokens"] = 2048
    else:
        kwargs["max_tokens"] = 2048

    resp = await client.chat.completions.create(**kwargs)
    raw = resp.choices[0].message.content or ""
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"raw_text": raw, "error": "JSON解析失败"}


@router.post("/screenshot/quick-recognize")
async def quick_recognize(
    file: UploadFile = File(...),
    slot_hint: str = Form(""),
):
    """
    上传单张截图后即时 AI 识别（快识 API）。
    @param file - 图片文件
    @param slot_hint - 可选的位置提示：cover/content/profile/comments
    @returns 识别结果含 slot_type, category, summary
    """
    if file.content_type and file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(400, f"不支持的图片格式: {file.content_type}")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "图片不能超过 10MB")

    client = _get_client()
    prompt = _QUICK_PROMPT
    if slot_hint and slot_hint in SLOT_LABELS:
        prompt += f"\n提示：用户表明这是一张「{SLOT_LABELS[slot_hint]}」。"

    try:
        result = await _vision_call(client, prompt, image_bytes)
        slot_type = str(result.get("slot_type", "")).strip().lower()
        if slot_type != "content":
            result["title"] = ""
            result["content_text"] = ""

        if slot_hint == "content" or slot_type == "content":
            content_text = str(result.get("content_text", "")).strip()
            title_text = str(result.get("title", "")).strip()
            if not content_text or not title_text:
                try:
                    from app.analysis.ocr_processor import OCRProcessor

                    ocr = OCRProcessor()
                    ocr_result = await ocr.extract_text(image_bytes, client)
                    ocr_title = str(ocr_result.get("title", "")).strip()
                    ocr_content = str(ocr_result.get("content", "")).strip()
                    ocr_tags = ocr_result.get("tags", [])
                    if not ocr_content and isinstance(ocr_tags, list):
                        ocr_content = _normalize_tags(ocr_tags)
                    if not title_text and ocr_title:
                        result["title"] = ocr_title
                    if not content_text and ocr_content:
                        result["content_text"] = ocr_content
                    if not str(result.get("summary", "")).strip() and ocr_content:
                        result["summary"] = ocr_content[:80]
                except Exception as ocr_error:
                    logger.warning("quick-recognize OCR fallback failed: %s", ocr_error)
        return {"success": True, **result}
    except Exception as e:
        logger.error("快速识别失败: %s", e)
        return {
            "success": False,
            "error": str(e),
            "slot_type": slot_hint or "unknown",
            "category": "",
            "summary": "",
            "title": "",
            "content_text": "",
            "confidence": 0.0,
        }


@router.post("/screenshot/deep-analyze")
async def deep_analyze(
    scenario: str = Form(...),
    cover: Optional[UploadFile] = File(None),
    content_img: Optional[UploadFile] = File(None),
    profile: Optional[UploadFile] = File(None),
    comments: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    extra_text: str = Form(""),
):
    """
    全量深度分析：上传完整图包后进行多维度分析。
    @param scenario - 使用场景：pre_publish / post_publish
    @param cover - 封面截图
    @param content_img - 正文截图
    @param profile - 主页截图
    @param comments - 评论区截图
    @param video - 视频录屏文件（可选）
    @param extra_text - 额外文字说明（自动过滤链接）
    """
    if scenario not in ("pre_publish", "post_publish"):
        raise HTTPException(400, "scenario 须为 pre_publish 或 post_publish")

    cleaned_text = strip_links(extra_text)

    slots: dict[str, bytes] = {}
    for name, upload in [("cover", cover), ("content", content_img), ("profile", profile), ("comments", comments)]:
        if upload:
            if upload.content_type and upload.content_type not in ALLOWED_IMAGE_MIME:
                raise HTTPException(400, f"{SLOT_LABELS[name]}格式不支持: {upload.content_type}")
            data = await upload.read()
            if len(data) > MAX_IMAGE_SIZE:
                raise HTTPException(400, f"{SLOT_LABELS[name]}不能超过 10MB")
            slots[name] = data

    if not slots:
        raise HTTPException(400, "至少上传一张截图")

    video_info = None
    if video:
        if video.content_type and video.content_type not in ALLOWED_VIDEO_MIME:
            raise HTTPException(400, f"视频格式不支持: {video.content_type}")
        video_data = await video.read()
        if len(video_data) > MAX_VIDEO_SIZE:
            raise HTTPException(400, "视频不能超过 100MB")
        video_info = {
            "filename": video.filename,
            "size_mb": round(len(video_data) / (1024 * 1024), 1),
            "content_type": video.content_type,
        }

    client = _get_client()
    results: dict = {
        "scenario": scenario,
        "slot_count": len(slots),
        "extra_text": cleaned_text,
        "video_info": video_info,
        "analyses": {},
    }

    import asyncio

    tasks: dict[str, object] = {}
    for slot_name, img_bytes in slots.items():
        prompt = DEEP_PROMPTS.get(slot_name, _QUICK_PROMPT)
        if scenario == "post_publish" and slot_name == "comments":
            prompt += "\n重点分析评论中的用户情感倾向和互动质量。"
        tasks[slot_name] = _vision_call(client, prompt, img_bytes)

    task_results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    for slot_name, task_result in zip(tasks.keys(), task_results):
        if isinstance(task_result, Exception):
            logger.error("分析 %s 失败: %s", slot_name, task_result)
            results["analyses"][slot_name] = {"error": str(task_result)}
        else:
            results["analyses"][slot_name] = task_result

    results["overall"] = _build_overall(results["analyses"], scenario)
    return results


def _build_overall(analyses: dict, scenario: str) -> dict:
    """根据各维度分析结果汇总综合评估。"""
    has_cover = "cover" in analyses and "error" not in analyses["cover"]
    has_content = "content" in analyses and "error" not in analyses["content"]
    has_profile = "profile" in analyses and "error" not in analyses["profile"]
    has_comments = "comments" in analyses and "error" not in analyses["comments"]

    completeness = sum([has_cover, has_content, has_profile, has_comments]) / 4 * 100

    tips: list[str] = []
    if not has_cover:
        tips.append("缺少封面截图，无法评估视觉吸引力")
    if not has_content:
        tips.append("缺少正文截图，无法分析内容质量")
    if scenario == "post_publish" and not has_comments:
        tips.append("发布后模式建议上传评论区截图以分析互动效果")
    if not has_profile:
        tips.append("上传主页截图可以更精准定位账号权重")

    return {
        "completeness": round(completeness),
        "scenario": "发布前分析" if scenario == "pre_publish" else "发布后分析",
        "tips": tips,
        "slots_analyzed": list(analyses.keys()),
    }


@router.post("/text/strip-links")
async def api_strip_links(text: str = Form("")):
    """
    过滤文本中的所有外部链接。
    @param text - 待过滤文本
    """
    return {"original": text, "cleaned": strip_links(text)}
