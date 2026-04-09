"""
多维度截图上传 + AI 快速识别 + 全量深度分析 API
支持封面、正文、主页、评论区截图上传及视频录屏。
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from PIL import Image

from app.agents.base_agent import _get_client, _is_mimo_openai_compat, _parse_json_from_llm_text
from app.analysis.mimo_video import build_mimo_video_url_content_part
from app.api.diagnose import (
    MAX_VIDEO_SIZE,
    MIME_TO_EXT,
    MIMO_VIDEO_MIME,
    _extract_first_video_frame,
    _store_temp_video_and_build_url,
    public_base_url_is_localhost_only,
)

router = APIRouter()
logger = logging.getLogger("noterx.screenshot")

MAX_IMAGE_SIZE = 10 * 1024 * 1024
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/webm", "video/quicktime"}

SLOT_LABELS = {
    "cover": "封面截图",
    "content": "正文内容截图",
    "profile": "主页截图",
    "comments": "评论区截图",
}

_QUICK_PROMPT = """你是小红书截图分类与文字提取工具。

## 铁律
- 只提取图中实际可见的文字，严禁编造。看不清就留空""。
- confidence 诚实反映把握程度。

## 如何判断 slot_type（最关键！先判类型再提取）

### cover（封面）的视觉特征：
- 一张大图占满屏幕（照片/美图/产品图）
- 可能叠加少量装饰文字（大号字、艺术字）
- **没有**段落式正文，**没有**标签列表，**没有**评论列表
- 底部可能有用户头像+昵称+点赞数

### content（笔记详情页）的视觉特征：
- 顶部有**笔记标题**（一行粗体文字）
- 下面有**段落式正文**（多行文字，可能有emoji分段）
- 底部通常有 **#标签** 列表
- 可能有"编辑""发布"按钮（编辑态）

### comments（评论区）的视觉特征：
- 多条评论排列，每条有：头像圆形 + 昵称 + 评论文字 + 点赞数
- 可能有"共XX条评论"标题
- **不是**正文，不要把评论内容当成 content_text

### profile（主页）的视觉特征：
- 顶部有大头像 + 昵称 + 粉丝数/关注数/获赞数
- 下面是笔记网格缩略图

## 提取规则
- title：**仅 content 类型**提取（页面顶部的笔记标题）。cover/comments/profile 一律留空 ""
- content_text：**仅 content 类型**提取（段落正文+标签）。其他类型留空 ""
- category：根据图片内容判断垂类（美食/穿搭/科技/旅行/生活）
- summary：1-2句概括
- extra_slots：同屏含评论区时 ["comments"]，否则 []

仅输出 JSON：
{"slot_type": "cover|content|profile|comments|other", "extra_slots": [], "category": "", "title": "", "content_text": "", "summary": "", "confidence": 0.0}"""

_VIDEO_QUICK_PROMPT = """你是小红书内容理解助手。用户上传了一段**视频**（可能是笔记录屏、Vlog、商品展示、成品笔记预览等）。

请根据画面、字幕与口播可见信息（如有）推断笔记形态，输出与截图快识**相同字段**的 JSON：
1) slot_type：多为 content；若几乎只有封面大字则 cover；整屏为个人主页则 profile；几乎只有评论列表则 comments；否则 other。
2) extra_slots：数组，规则同截图快识（分屏含评论区时含 "comments"，否则 []）。
3) category：垂类（穿搭、美食、数码、旅行、美妆、健身、生活、家居等）。
4) title：画面或字幕中清晰的笔记标题务必写入；若无则根据主题拟一条不超过 40 字的标题钩子，勿编造具体数字/价格。
5) content_text：可见正文、话题标签、或按时间线列出的视频要点；没有则写 2～4 句主题描述。
6) summary：1～2 句整体概括。
7) confidence：0～1。

仅输出合法 JSON，不要用 markdown 代码块：
{"slot_type": "", "extra_slots": [], "category": "", "title": "", "content_text": "", "summary": "", "confidence": 0.0}"""

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


def _normalize_extra_slots(raw: object) -> list[str]:
    """将模型返回的 extra_slots 规范为 cover/content/profile/comments 子集。"""
    allowed = {"cover", "content", "profile", "comments"}
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        t = _normalize_slot_type(item)
        if t in allowed and t not in out:
            out.append(t)
    return out


def _normalize_slot_type(raw: object) -> str:
    """标准化模型返回的 slot_type，降低大小写/同义词导致的误判。"""
    text = str(raw or "").strip().lower()
    alias_map = {
        "cover": "cover",
        "封面": "cover",
        "content": "content",
        "detail": "content",
        "details": "content",
        "正文": "content",
        "详情": "content",
        "profile": "profile",
        "主页": "profile",
        "home": "profile",
        "comments": "comments",
        "comment": "comments",
        "评论": "comments",
        "评论区": "comments",
        "other": "other",
        "unknown": "other",
    }
    return alias_map.get(text, "other")


def _prepare_quick_recognize_image(image_bytes: bytes) -> tuple[bytes, str]:
    """
    快识前智能压缩。
    - 长图(h>2w): 保留宽度可读性(最大1024px宽, 最大4096px高), 文字不会缩到看不清
    - 普通图: 限制长边到 max_edge
    @returns (image_bytes, image_mime)
    """
    max_edge = int(os.getenv("QUICK_RECOGNIZE_MAX_EDGE", "1280"))
    quality = int(os.getenv("QUICK_RECOGNIZE_JPEG_QUALITY", "92"))
    mime_map = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
        "GIF": "image/gif",
        "MPO": "image/jpeg",
    }
    if max_edge <= 0:
        try:
            im0 = Image.open(BytesIO(image_bytes))
            fmt0 = (im0.format or "PNG").upper()
            return image_bytes, mime_map.get(fmt0, "image/png")
        except Exception:
            return image_bytes, "image/png"
    try:
        im = Image.open(BytesIO(image_bytes))
        if im.mode in ("RGBA", "P"):
            im = im.convert("RGB")
        elif im.mode != "RGB":
            im = im.convert("RGB")
        w, h = im.size
        fmt = (im.format or "PNG").upper()
        mime = mime_map.get(fmt, "image/png")

        need_resize = False

        if h > 2 * w:
            # === 长图特殊处理: 保留宽度可读性 ===
            LONG_MAX_W = 1024
            LONG_MAX_H = 4096
            target_w = min(w, LONG_MAX_W)
            scale = target_w / w
            target_h = min(int(h * scale), LONG_MAX_H)
            if (target_w, target_h) != (w, h):
                im = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
                need_resize = True
            logger.info("长图缩图: %dx%d → %dx%d", w, h, target_w, target_h)
        else:
            # === 普通图: 限制长边 ===
            if max(w, h) > max_edge:
                im.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                need_resize = True

        if not need_resize and max(w, h) <= max_edge:
            return image_bytes, mime

        buf = BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception as e:
        logger.warning("快识缩图跳过，使用原图: %s", e)
        return image_bytes, "image/png"


async def _vision_call(
    client,
    prompt: str,
    image_bytes: bytes,
    *,
    model: str | None = None,
    max_out_tokens: int | None = None,
    image_mime: str = "image/png",
) -> dict:
    """调用多模态模型进行图片分析。"""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    resolved_model = model or os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")
    out_cap = max_out_tokens if max_out_tokens is not None else 2048

    kwargs = {
        "model": resolved_model,
        "messages": [
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请分析这张截图。"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{image_mime};base64,{b64}"},
                    },
                ],
            },
        ],
    }
    if _is_mimo_openai_compat():
        kwargs["max_completion_tokens"] = out_cap
    else:
        kwargs["max_tokens"] = out_cap

    # 60s 超时防止 MiMo API 挂住
    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(**kwargs),
            timeout=60,
        )
    except asyncio.TimeoutError:
        return {"error": "视觉识别超时(60s)", "slot_type": "other"}
    raw = resp.choices[0].message.content or ""
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"raw_text": raw, "error": "JSON解析失败"}


def _normalize_quick_recognition_fields(result: dict) -> None:
    """统一快识字段：slot_type、extra_slots 及 cover/content 下的 title 规则。"""
    slot_type = _normalize_slot_type(result.get("slot_type", ""))
    result["slot_type"] = slot_type
    result["extra_slots"] = _normalize_extra_slots(result.get("extra_slots"))
    if slot_type == "cover":
        result["content_text"] = ""
    elif slot_type != "content":
        result["title"] = ""
        result["content_text"] = ""


def _quick_payload_is_empty(result: dict) -> bool:
    return (
        not str(result.get("title", "")).strip()
        and not str(result.get("content_text", "")).strip()
        and not str(result.get("summary", "")).strip()
    )


async def _video_url_quick_call(client, video_url: str) -> dict:
    """
    通过 MiMo 视频理解（video_url content part）请求模型，返回与快识相同结构的 JSON。
    消息体对齐：https://platform.xiaomimimo.com/#/docs/usage-guide/multimodal-understanding/video-understanding
    """
    resolved_model = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")
    out_cap = int(os.getenv("QUICK_RECOGNIZE_VIDEO_MAX_COMPLETION_TOKENS", "32768"))
    video_part = build_mimo_video_url_content_part(video_url)
    kwargs = {
        "model": resolved_model,
        "messages": [
            {
                "role": "system",
                "content": "You return ONLY valid JSON for Xiaohongshu note understanding; no markdown fences.",
            },
            {
                "role": "user",
                "content": [
                    video_part,
                    {"type": "text", "text": _VIDEO_QUICK_PROMPT},
                ],
            },
        ],
        "temperature": float(os.getenv("LLM_TEMPERATURE", "0.3")),
    }
    if _is_mimo_openai_compat():
        kwargs["max_completion_tokens"] = out_cap
    else:
        kwargs["max_tokens"] = out_cap

    resp = await client.chat.completions.create(**kwargs)
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        parsed = _parse_json_from_llm_text(raw)
        if isinstance(parsed, dict):
            return parsed
        return {"raw_text": raw, "error": "JSON解析失败"}


async def _ocr_supplement_quick_result(client, image_bytes: bytes, result: dict, ocr_cap: int) -> None:
    """title/content 缺省时用 OCR 补全（与图片快识一致）。"""
    content_text = str(result.get("content_text", "")).strip()
    title_text = str(result.get("title", "")).strip()
    if content_text and title_text:
        return
    try:
        from app.analysis.ocr_processor import OCRProcessor

        ocr = OCRProcessor()
        ocr_result = await ocr.extract_text(image_bytes, client, max_tokens_override=ocr_cap)
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

    image_bytes_raw = await file.read()
    if len(image_bytes_raw) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "图片不能超过 10MB")

    image_bytes, image_mime = _prepare_quick_recognize_image(image_bytes_raw)

    client = _get_client()
    prompt = _QUICK_PROMPT
    if slot_hint and slot_hint in SLOT_LABELS:
        prompt += f"\n提示：用户表明这是一张「{SLOT_LABELS[slot_hint]}」。"

    # 快识走 _vision_call 默认 LLM_MODEL_OMNI（多模态）；勿单独改用纯文本模型。
    quick_max_out = int(os.getenv("QUICK_RECOGNIZE_MAX_COMPLETION_TOKENS", "32768"))
    ocr_cap = int(os.getenv("QUICK_RECOGNIZE_OCR_MAX_TOKENS", "32768"))

    try:
        result = await _vision_call(
            client,
            prompt,
            image_bytes,
            max_out_tokens=quick_max_out,
            image_mime=image_mime,
        )
        _normalize_quick_recognition_fields(result)
        slot_type = str(result.get("slot_type", ""))
        logger.info(
            "快识结果: slot_type=%s extra_slots=%s title=%s category=%s keys=%s",
            slot_type,
            result.get("extra_slots"),
            str(result.get("title", ""))[:50],
            result.get("category", ""),
            list(result.keys()),
        )

        await _ocr_supplement_quick_result(client, image_bytes_raw, result, ocr_cap)
        return {"success": True, **result}
    except Exception as e:
        logger.error("快速识别失败: %s", e)
        return {
            "success": False,
            "error": str(e),
            "slot_type": slot_hint or "unknown",
            "extra_slots": [],
            "category": "",
            "summary": "",
            "title": "",
            "content_text": "",
            "confidence": 0.0,
        }


@router.post("/screenshot/quick-recognize-video")
async def quick_recognize_video(request: Request, file: UploadFile = File(...)):
    """
    上传视频后进行 AI 快识，返回字段与 /screenshot/quick-recognize 一致。
    优先使用 MiMo 支持的 video_url 全片理解；失败或非支持格式时抽代表帧走视觉快识。
    @param file - mp4 / webm / quicktime
    """
    if file.content_type and file.content_type not in ALLOWED_VIDEO_MIME:
        raise HTTPException(400, f"不支持的视频格式: {file.content_type}")

    video_bytes = await file.read()
    if len(video_bytes) > MAX_VIDEO_SIZE:
        raise HTTPException(400, f"视频不能超过 {MAX_VIDEO_SIZE // (1024 * 1024)}MB")

    mime = (file.content_type or "video/mp4").strip()
    container_ext = MIME_TO_EXT.get(mime, ".mp4")
    client = _get_client()
    quick_max_out = int(os.getenv("QUICK_RECOGNIZE_MAX_COMPLETION_TOKENS", "32768"))
    ocr_cap = int(os.getenv("QUICK_RECOGNIZE_OCR_MAX_TOKENS", "32768"))

    result: dict = {}
    try_mimo_video_url = mime in MIMO_VIDEO_MIME and not public_base_url_is_localhost_only(request)
    if not try_mimo_video_url and mime in MIMO_VIDEO_MIME:
        logger.info(
            "视频快识：当前推导的 API 基址为内网/本机，跳过 MiMo video_url；"
            "上线请设置 MIMO_VIDEO_PUBLIC_BASE_URL，或由反向代理传入 X-Forwarded-Proto / X-Forwarded-Host",
        )
    if try_mimo_video_url:
        try:
            video_url = _store_temp_video_and_build_url(request, video_bytes, mime)
            raw = await _video_url_quick_call(client, video_url)
            if isinstance(raw, dict):
                result = raw
            logger.info("视频快识 video_url 完成 keys=%s", list(result.keys()))
        except Exception as e:
            logger.warning("视频快识 video_url 失败，将尝试抽帧: %s", e)
            result = {}

    if not isinstance(result, dict):
        result = {}

    _normalize_quick_recognition_fields(result)

    frame_jpeg: Optional[bytes] = None
    if _quick_payload_is_empty(result):
        frame_jpeg = _extract_first_video_frame(video_bytes, container_ext)
        if frame_jpeg:
            try:
                img_bytes, img_mime = _prepare_quick_recognize_image(frame_jpeg)
                fp = _QUICK_PROMPT + "\n提示：这是一段视频中的**代表帧**（非完整视频），请根据画面推断笔记标题与正文要点。"
                fr = await _vision_call(
                    client, fp, img_bytes, max_out_tokens=quick_max_out, image_mime=img_mime
                )
                if isinstance(fr, dict):
                    result = fr
                    _normalize_quick_recognition_fields(result)
                    logger.info("视频快识抽帧视觉完成 slot_type=%s", result.get("slot_type"))
            except Exception as e:
                logger.warning("视频快识抽帧视觉失败: %s", e)

    if frame_jpeg is None and (
        not str(result.get("title", "")).strip() or not str(result.get("content_text", "")).strip()
    ):
        frame_jpeg = _extract_first_video_frame(video_bytes, container_ext)
    if frame_jpeg:
        await _ocr_supplement_quick_result(client, frame_jpeg, result, ocr_cap)

    if _quick_payload_is_empty(result):
        return {
            "success": False,
            "error": "无法从视频中识别有效文字或主题，请换片段或手动填写",
            "slot_type": "other",
            "extra_slots": [],
            "category": "",
            "summary": "",
            "title": "",
            "content_text": "",
            "confidence": 0.0,
        }

    logger.info(
        "视频快识最终结果: slot_type=%s title=%s category=%s",
        result.get("slot_type"),
        str(result.get("title", ""))[:50],
        result.get("category", ""),
    )
    return {"success": True, **result}


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
