"""
多维度截图上传 + AI 快速识别 + 全量深度分析 API
支持封面、内容、主页、评论区截图上传及视频录屏。
"""
import base64
import json
import logging
import os
import re
import uuid
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

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

_QUICK_PROMPT = """你是一个内容分析助手。请快速分析这张截图，识别出：
1. 这是什么类型的截图（封面/正文/主页/评论区/其他）
2. 内容主题/垂类（如：穿搭、美食、数码、旅行、美妆、健身等）
3. 从图中提取的关键信息摘要（2-3 句话）

以JSON格式输出：
{"slot_type": "cover|content|profile|comments|other", "category": "类别", "summary": "摘要", "confidence": 0.0-1.0}"""

_DEEP_PROMPT_COVER = """分析这张封面截图的视觉吸引力，输出JSON：
{"visual_score": 0-100, "color_scheme": "配色描述", "composition": "构图评价", "text_overlay": "文字覆盖率评估", "suggestions": ["建议1","建议2"]}"""

_DEEP_PROMPT_CONTENT = """提取这张笔记正文截图中的完整内容，输出JSON：
{"title": "标题", "content": "正文全文", "tags": ["标签1"], "word_count": 数字, "readability": "可读性评价"}"""

_DEEP_PROMPT_PROFILE = """分析这张博主主页截图，输出JSON：
{"nickname": "昵称", "follower_count": "粉丝数(文本)", "note_count": "笔记数", "bio": "简介", "account_level": "素人/腰部/头部", "niche": "垂类领域"}"""

_DEEP_PROMPT_COMMENTS = """分析这张评论区截图中的评论，输出JSON：
{"comments": [{"text": "评论内容", "sentiment": "positive|negative|neutral"}], "overall_sentiment": "整体情感倾向", "engagement_quality": "互动质量评价", "top_concerns": ["热点话题1"]}"""

DEEP_PROMPTS = {
    "cover": _DEEP_PROMPT_COVER,
    "content": _DEEP_PROMPT_CONTENT,
    "profile": _DEEP_PROMPT_PROFILE,
    "comments": _DEEP_PROMPT_COMMENTS,
}

LINK_PATTERN = re.compile(r"https?://\S+", re.IGNORECASE)


def strip_links(text: str) -> str:
    """剔除文本中所有 http/https 链接"""
    return LINK_PATTERN.sub("", text).strip()


async def _vision_call(client, prompt: str, image_bytes: bytes) -> dict:
    """调用多模态模型进行图片分析"""
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
        return {"success": True, **result}
    except Exception as e:
        logger.error("快速识别失败: %s", e)
        return {"success": False, "error": str(e), "slot_type": slot_hint or "unknown", "category": "", "summary": ""}


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
    tasks = {}
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

    # 生成综合评估
    results["overall"] = _build_overall(results["analyses"], scenario)

    return results


def _build_overall(analyses: dict, scenario: str) -> dict:
    """根据各维度分析结果汇总综合评估"""
    has_cover = "cover" in analyses and "error" not in analyses["cover"]
    has_content = "content" in analyses and "error" not in analyses["content"]
    has_profile = "profile" in analyses and "error" not in analyses["profile"]
    has_comments = "comments" in analyses and "error" not in analyses["comments"]

    completeness = sum([has_cover, has_content, has_profile, has_comments]) / 4 * 100

    tips = []
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
