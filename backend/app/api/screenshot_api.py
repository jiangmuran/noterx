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
from app.analysis.video_stt import transcribe_video_with_whisper
from app.api.diagnose import (
    MAX_VIDEO_SIZE,
    MIME_TO_EXT,
    MIMO_VIDEO_MIME,
    _extract_first_video_frame,
    _store_temp_video_and_build_url,
    get_public_base_url_diagnostics,
)

router = APIRouter()
logger = logging.getLogger("noterx.screenshot")


def _env_int(name: str, default: int, *, min_v: int, max_v: int) -> int:
    """读取整数环境变量并夹紧到 [min_v, max_v]。"""
    try:
        v = int(os.getenv(name, str(default)))
    except ValueError:
        v = default
    return max(min_v, min(v, max_v))


def _env_float(name: str, default: float, *, min_v: float, max_v: float) -> float:
    """读取浮点环境变量并夹紧到 [min_v, max_v]。"""
    try:
        v = float(os.getenv(name, str(default)))
    except ValueError:
        v = default
    return max(min_v, min(v, max_v))


def _quick_image_max_out_tokens() -> int:
    """快识图片：默认与 .env.example 建议一致，避免过大 max_completion_tokens 被网关拒掉。"""
    return _env_int("QUICK_RECOGNIZE_MAX_COMPLETION_TOKENS", 2048, min_v=256, max_v=8192)


def _quick_ocr_max_tokens() -> int:
    """快识 OCR：长 content 的 JSON 易截断；默认 2048，上限与网关对齐。"""
    return _env_int("QUICK_RECOGNIZE_OCR_MAX_TOKENS", 2048, min_v=512, max_v=8192)


MAX_IMAGE_SIZE = 10 * 1024 * 1024
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/webm", "video/quicktime"}

SLOT_LABELS = {
    "cover": "封面截图",
    "content": "正文内容截图",
    "profile": "主页截图",
    "comments": "评论区截图",
}

_QUICK_PROMPT = """分析这张小红书截图，判断类型并提取文字。

## slot_type 判断规则
- cover：一张大图占满屏幕，没有段落正文，没有标签列表
- content：有笔记标题（粗体）+ 段落正文 + #标签。长图续页（只有正文没标题）也算content
- comments：多条评论列表（头像+昵称+评论文字）
- profile：大头像+昵称+粉丝数+笔记网格
- other：以上都不是

## 提取规则
- title：仅content类型提取笔记标题。其他类型留空""
- content_text：仅content类型提取正文+标签。其他类型留空""
- category：美食/穿搭/科技/旅行/生活
- summary：1句概括
- likes：图中可见的点赞数（整数，看不到则0）

严禁编造！看不清就留空。

输出JSON（不要嵌套，全部平铺）：
{"slot_type":"","category":"","title":"","content_text":"","summary":"","confidence":0.0,"likes":0}"""

_VIDEO_QUICK_PROMPT = """你是小红书内容理解助手。用户上传了一段**视频**（录屏、Vlog、步骤演示等）。

## 关于 title（极其重要）
小红书**笔记标题**一般在**发布页的标题输入区或信息流封面大字**，**不会**等同于「视频里在讲什么」。
- **title 请几乎恒为 ""**（空字符串）。除非画面里**明确出现与 App 发布页一致的标题栏文案**（极少见）。
- **禁止**把下列内容写入 title：画面说明、步骤提示（如「切记不要焯水」）、口播摘要、贴纸/花字、**「视频展示…」「画面中…」类描述句**。
- 用户若要自动填标题，应**另上传一张含笔记标题/封面的截图**；本接口只处理视频。

## content_text = 全文字幕摘录（供后续评审，极其重要）
你必须**通篇观看整段视频**（从开头到结尾），不能只依据前几秒或片段猜测。
- **content_text 的正文语义 = 字幕全文**：按**时间顺序**串联，尽量**逐字摘录**视频中出现的：
  - 画面内**字幕条、花字、贴纸、角标、弹窗文字**等所有可读文案；
  - 若画面无字但有清晰口播，则把口播**转写成连续文本**（与字幕同等对待）。
- **禁止**用「视频展示了…」「画面中一位…」「本视频主要讲…」这类**元描述**充当正文主体；若需一句总览，只放在 summary。
- 话题标签 #xxx 若出现，按出现顺序并入 content_text 末尾或对应句旁，勿单独编造标签。
- **严禁编造**；听不清/看不清处用 `[无法辨识]` 占位，可注明大致时段（如 `[约00:15 无法辨识]`）。
- 同一句字幕/口播在画面中**明显重复多次**时，可合并为一句并注明「（重复）」，避免无意义堆砌。

## 其它字段
1) slot_type：多为 content；整屏主页 profile；几乎只有评论列表 comments；否则 other。
2) extra_slots：规则同截图快识。
3) category：垂类。
4) summary：**仅** 1～2 句整体提要（给人类快速扫一眼），**不得**替代 content_text；不得把字幕正文只写在 summary 而 content_text 留空。
5) confidence：0～1，反映你对「字幕摘录完整度与准确度」的把握。

## 错误示例 vs 正确示例（必须遵守）
- **错误** content_text：「视频帧显示一位女士在厨房烹饪蘑菇，并叠加字幕提示不要焯水。」（这是**旁白式说明**，禁止）
- **正确** content_text：多行**字幕原文**，例如：「这就是我家餐桌上\\n出现率最多的一道菜\\n切记不要焯水」（逐字来自画面/口播，不要改写成「提示不要焯水」以外的意译段落）

仅输出合法 JSON，不要用 markdown 代码块：
{"slot_type": "", "extra_slots": [], "category": "", "title": "", "content_text": "", "summary": "", "confidence": 0.0}"""

_VIDEO_SUBTITLE_TRANSCRIPT_PROMPT = """你是视频字幕与口播听写专员。输入为**完整视频**（已上传）。

## 唯一任务
通篇观看**从开头到结尾**，按**时间顺序**列出**每一条**出现的：
- 画面内字幕条、花字、贴纸、角标上的文字（逐字）；
- 清晰可辨的**口播**（按句拆成多条）。

## 输出格式（仅此一种）
只输出合法 JSON，不要用 markdown 代码块：
{"subtitle_lines":["第一句","第二句","第三句",...]}

## 铁律
- **subtitle_lines 数组越长越好**：不要合并成一两句摘要；不要把全片压成一条。
- **禁止**输出 category、title、summary、slot_type 等其它字段。
- **禁止**写「视频展示了」「画面中」等旁白描述；数组里**只放原文台词/字幕**。
- 视频中后段、结尾的字幕与口播**必须与开头同等对待**，不可只写开头一句（例如只写「切记不要焯水」而漏掉前面多句花字是绝对错误）。
- 听不清处单条写 `[无法辨识]`；不要编造。
- 同一句在视频中反复出现可只保留一条并在该条末尾加「（重复）」。"""

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
    # Try multiple JSON extraction strategies
    clean = raw.strip()
    # 1) Remove markdown code fence
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    # 2) Direct parse
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass
    # 3) Use enhanced parser from base_agent (handles thinking tags, raw_decode)
    try:
        from app.agents.base_agent import _parse_json_from_llm_text
        return _parse_json_from_llm_text(raw)
    except Exception:
        pass
    # 4) Last resort: find first { ... } manually
    left = raw.find("{")
    right = raw.rfind("}")
    if left != -1 and right > left:
        try:
            return json.loads(raw[left:right + 1])
        except json.JSONDecodeError:
            pass
    logger.warning("快识视觉JSON解析全部失败, 原始输出前300字: %s", raw[:300])
    return {"raw_text": raw[:200], "error": "JSON解析失败"}


def _sanitize_video_derived_title(result: dict) -> None:
    """
    视频快识易把「画面描述」误填进 title。清空并并入 content_text，避免与真实笔记标题混淆。
    """
    t = str(result.get("title", "")).strip()
    if not t:
        return
    bad = False
    if t.startswith("视频"):
        bad = True
    if "展示" in t and len(t) >= 8:
        bad = True
    if any(k in t for k in ("叠加文字", "叠加", "字幕提示", "口播", "镜头中", "画面中")):
        bad = True
    if "画面" in t and any(k in t for k in ("一位", "一名", "有人", "女性", "男性")):
        bad = True
    if not bad:
        return
    ct = str(result.get("content_text", "")).strip()
    result["content_text"] = f"{t}\n{ct}".strip() if ct else t
    result["title"] = ""


def _content_text_looks_like_video_scene_caption(text: str) -> bool:
    """
    判断 content_text 是否为「视频帧显示…叠加字幕…」类画面说明，而非逐字字幕摘录。
    命中则应收窄/清空并走抽帧或 OCR 兜底。
    """
    s = str(text or "").strip()
    if not s:
        return False
    markers = (
        "视频帧显示",
        "视频帧中",
        "视频显示一位",
        "视频展示一位",
        "叠加字幕提示",
        "并叠加字幕",
        "画面中一位",
        "画面中一名",
        "画面显示一位",
        "镜头中一位",
        "本视频主要",
        "本视频展示",
        "视频展示了",
    )
    if any(m in s for m in markers):
        return True
    # 整段像一句旁白：以「视频」开头且含「显示/展示」且偏长
    if s.startswith("视频") and len(s) >= 12 and ("显示" in s or "展示" in s):
        return True
    return False


def _strip_video_scene_caption_lines(text: str) -> str:
    """
    清除内容中的「画面描述型」旁白行，仅保留逐字字幕/口播文本。
    """
    s = str(text or "").strip()
    if not s:
        return ""

    lines = [ln.strip() for ln in s.splitlines() if ln.strip()]
    if not lines:
        return ""

    kept = [ln for ln in lines if not _content_text_looks_like_video_scene_caption(ln)]
    if kept:
        return "\n".join(kept).strip()
    return ""


def _sanitize_video_meta_narrative_content(result: dict) -> None:
    """
    若正文混入画面叙述旁白，移除旁白行，仅保留逐字字幕/口播。
    旧逻辑会整段清空，可能误伤已并入的 STT 正文。
    """
    ct = str(result.get("content_text", "")).strip()
    if not ct:
        return
    cleaned = _strip_video_scene_caption_lines(ct)
    result["content_text"] = cleaned


def _normalize_quick_recognition_fields(
    result: dict,
    *,
    is_video_frame_fallback: bool = False,
) -> None:
    """
    统一快识字段：slot_type、extra_slots 及 cover/content 下的 title 规则。
    @param is_video_frame_fallback - 视频抽帧兜底：画面常被误判为 cover，若已有花字/字幕正文则不得清空 content_text
    """
    slot_type = _normalize_slot_type(result.get("slot_type", ""))
    result["slot_type"] = slot_type
    result["extra_slots"] = _normalize_extra_slots(result.get("extra_slots"))
    # Normalize flat likes/publisher into engagement_signal/publisher for frontend
    if "likes" in result and "engagement_signal" not in result:
        likes = int(result.pop("likes", 0) or 0)
        result["engagement_signal"] = {"likes_visible": likes, "collects_visible": 0, "comments_visible": 0, "is_high_engagement": likes > 1000}
    if "name" in result and "publisher" not in result:
        result["publisher"] = {"name": result.pop("name", ""), "follower_count": result.pop("follower_count", "")}
    if is_video_frame_fallback and str(result.get("content_text", "")).strip():
        result["slot_type"] = "content"
        slot_type = "content"
    if slot_type == "cover":
        result["content_text"] = ""
    elif slot_type != "content":
        result["title"] = ""
        result["content_text"] = ""


def _coerce_video_quick_slot_when_body_present(result: dict) -> None:
    """视频快识成功返回前：有正文但 slot 为 cover/other 时改为 content，避免前端首轮忽略正文。"""
    body = str(result.get("content_text", "")).strip()
    if not body:
        return
    st = _normalize_slot_type(result.get("slot_type", ""))
    if st in ("profile", "comments"):
        return
    if st != "content":
        result["slot_type"] = "content"


def _quick_payload_is_empty(result: dict) -> bool:
    return (
        not str(result.get("title", "")).strip()
        and not str(result.get("content_text", "")).strip()
        and not str(result.get("summary", "")).strip()
    )


def _video_subtitle_payload_insufficient(result: dict) -> bool:
    """
    视频快识：无可用字幕正文（含模型把画面说明误填进 content_text）时需抽帧或 OCR。
    """
    ct = str(result.get("content_text", "")).strip()
    if ct and not _strip_video_scene_caption_lines(ct):
        return True
    return _quick_payload_is_empty(result)


def _quick_video_mimo_part(video_url: str) -> dict:
    """
    视频快识专用：略提高默认 fps、默认 max 分辨率，利于扫到更多花字帧。
    可通过 QUICK_RECOGNIZE_VIDEO_FPS、QUICK_RECOGNIZE_VIDEO_MEDIA_RESOLUTION 覆盖。
    """
    fps = _env_float("QUICK_RECOGNIZE_VIDEO_FPS", 4.0, min_v=0.5, max_v=10.0)
    res_raw = (os.getenv("QUICK_RECOGNIZE_VIDEO_MEDIA_RESOLUTION") or "max").strip().lower()
    res = res_raw if res_raw in ("default", "max") else "max"
    return build_mimo_video_url_content_part(video_url, fps=fps, media_resolution=res)


def _parse_subtitle_lines_payload(raw: object) -> list[str]:
    """从专向听写 JSON 中解析 subtitle_lines（兼容 lines / subtitles）。"""
    if not isinstance(raw, dict):
        return []
    for key in ("subtitle_lines", "lines", "subtitles"):
        val = raw.get(key)
        if isinstance(val, list):
            out: list[str] = []
            for x in val:
                s = str(x).strip()
                if not s:
                    continue
                for ln in s.split("\n"):
                    t = ln.strip()
                    if t:
                        out.append(t)
            return out
        if isinstance(val, str) and val.strip():
            return [ln.strip() for ln in val.replace("；", "\n").split("\n") if ln.strip()]
    return []


def _merge_subtitle_transcript_into_result(result: dict, lines: list[str]) -> None:
    """
    将第二轮「专向听写」结果并入 content_text：在明显比首轮更完整时覆盖。
    """
    cleaned = [str(x).strip() for x in lines if x and str(x).strip()]
    if not cleaned:
        return
    transcript = "\n".join(cleaned)
    prev = str(result.get("content_text", "")).strip()
    n_lines = len(cleaned)
    prev_lines = prev.count("\n") + (1 if prev else 0)
    much_richer = (
        len(transcript) > int(len(prev) * 1.05)
        or n_lines >= max(3, prev_lines + 1)
        or (n_lines >= 2 and prev_lines <= 1)
    )
    if not prev or much_richer:
        result["content_text"] = transcript
        logger.info(
            "视频快识专向听写合并: lines=%s prev_len=%s new_len=%s",
            n_lines,
            len(prev),
            len(transcript),
        )


def _merge_stt_into_video_result(result: dict, stt: str) -> None:
    """将 Whisper 口播转写并入 content_text（与画面字幕互补）。"""
    text = (stt or "").strip()
    if not text:
        return
    prev_raw = str(result.get("content_text", "")).strip()
    prev = _strip_video_scene_caption_lines(prev_raw)
    if not prev:
        result["content_text"] = text
        return
    if text in prev or prev in text:
        if len(text) > len(prev):
            result["content_text"] = text
        return
    result["content_text"] = f"{prev}\n\n{text}".strip()


async def _video_url_quick_call(client, video_url: str) -> dict:
    """
    通过 MiMo 视频理解（video_url content part）请求模型，返回与快识相同结构的 JSON。
    消息体对齐：https://platform.xiaomimimo.com/#/docs/usage-guide/multimodal-understanding/video-understanding
    """
    resolved_model = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")
    out_cap = _env_int("QUICK_RECOGNIZE_VIDEO_MAX_COMPLETION_TOKENS", 4096, min_v=256, max_v=8192)
    video_part = _quick_video_mimo_part(video_url)
    kwargs = {
        "model": resolved_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Return ONLY valid JSON; no markdown fences. "
                    "Field content_text must be VERBATIM subtitle/caption/on-screen text lines "
                    "(and clear voiceover transcription) in time order — NOT a prose description "
                    "of scenes (never start with phrases like 'the video shows' or scene summaries)."
                ),
            },
            {
                "role": "user",
                "content": [
                    video_part,
                    {"type": "text", "text": _VIDEO_QUICK_PROMPT},
                ],
            },
        ],
        "temperature": min(float(os.getenv("LLM_TEMPERATURE", "0.3")), 0.15),
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


async def _video_url_subtitle_transcript_call(client, video_url: str) -> list[str]:
    """
    第二轮：同一 video_url，仅请求 subtitle_lines，减轻模型在 category/summary 上分心导致只摘一句的问题。
    """
    resolved_model = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")
    out_cap = _env_int(
        "QUICK_RECOGNIZE_VIDEO_TRANSCRIPT_MAX_COMPLETION_TOKENS",
        8192,
        min_v=512,
        max_v=8192,
    )
    video_part = _quick_video_mimo_part(video_url)
    kwargs = {
        "model": resolved_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Return ONLY valid JSON with a single key subtitle_lines (array of strings). "
                    "Each string is one caption or spoken line in time order. No markdown fences."
                ),
            },
            {
                "role": "user",
                "content": [
                    video_part,
                    {"type": "text", "text": _VIDEO_SUBTITLE_TRANSCRIPT_PROMPT},
                ],
            },
        ],
        "temperature": min(float(os.getenv("LLM_TEMPERATURE", "0.3")), 0.1),
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
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = _parse_json_from_llm_text(raw)
        if not isinstance(parsed, dict):
            return []
    return _parse_subtitle_lines_payload(parsed)


def _video_title_body_same_short_hook(result: dict) -> bool:
    """
    标题与正文是否为同一句短花字（常见于视频首帧钩子），用于触发首帧 OCR 补全。
    """
    tt = str(result.get("title", "")).strip()
    ct = str(result.get("content_text", "")).strip()
    return bool(tt and ct and tt == ct and len(ct) <= 40)


def _ocr_supplement_already_sufficient(title_text: str, content_text: str) -> bool:
    """
    判断快识是否已足够完整，可跳过首帧 OCR 补全。

    视频场景里模型常把同一句花字同时填进标题与正文（如「注意看」），若二者非空即跳过 OCR，
    则永远无法用首帧 OCR 拉长正文，口播 ASR 又失败时界面会一直只有三个字。
    """
    ct = (content_text or "").strip()
    tt = (title_text or "").strip()
    if not ct or not tt:
        return False
    if tt == ct and len(ct) <= 40:
        return False
    if len(ct) >= 52:
        return True
    if tt != ct and len(ct) >= 32:
        return True
    return False


async def _ocr_supplement_quick_result(client, image_bytes: bytes, result: dict, ocr_cap: int) -> None:
    """title/content 缺省或过短时用 OCR 补全（与图片快识一致）。"""
    content_text = str(result.get("content_text", "")).strip()
    title_text = str(result.get("title", "")).strip()
    if _ocr_supplement_already_sufficient(title_text, content_text):
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
        elif content_text and ocr_content:
            # 视觉只摘到一句花字时，OCR 可能带回更长片段（含截断抢救）
            if len(ocr_content) > len(content_text) + 12 or ocr_content.count("\n") > content_text.count(
                "\n",
            ):
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
    quick_max_out = _quick_image_max_out_tokens()
    ocr_cap = _quick_ocr_max_tokens()

    try:
        result = await _vision_call(
            client,
            prompt,
            image_bytes,
            max_out_tokens=quick_max_out,
            image_mime=image_mime,
        )
        if not isinstance(result, dict):
            result = {}
        if result.get("error"):
            logger.warning("快识视觉阶段失败: %s", result.get("error"))
            return {
                "success": False,
                "error": str(result.get("error", "视觉识别失败")),
                "media_source": "image",
                "slot_type": slot_hint or str(result.get("slot_type", "unknown")),
                "extra_slots": [],
                "category": "",
                "summary": "",
                "title": "",
                "content_text": "",
                "confidence": 0.0,
            }
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
        if _quick_payload_is_empty(result):
            return {
                "success": False,
                "error": "未识别到有效标题、正文或摘要，请换更清晰截图或手动填写",
                "media_source": "image",
                "slot_type": str(result.get("slot_type", slot_hint or "unknown")),
                "extra_slots": result.get("extra_slots") or [],
                "category": str(result.get("category", "")),
                "summary": str(result.get("summary", "")),
                "title": str(result.get("title", "")),
                "content_text": str(result.get("content_text", "")),
                "confidence": float(result.get("confidence") or 0.0),
            }
        out = {"success": True, **result}
        out["media_source"] = "image"
        return out
    except Exception as e:
        logger.error("快速识别失败: %s", e)
        return {
            "success": False,
            "error": str(e),
            "media_source": "image",
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
    quick_max_out = _quick_image_max_out_tokens()
    ocr_cap = _quick_ocr_max_tokens()

    stt_task = asyncio.create_task(transcribe_video_with_whisper(video_bytes, container_ext))

    result: dict = {}
    video_url_mimo: Optional[str] = None
    url_diag = get_public_base_url_diagnostics(request)
    try_mimo_video_url = mime in MIMO_VIDEO_MIME and bool(url_diag.get("ok"))
    if not try_mimo_video_url and mime in MIMO_VIDEO_MIME:
        logger.info(
            "视频快识：跳过 MiMo video_url，原因=%s，source=%s，base=%s；"
            "上线请设置 MIMO_VIDEO_PUBLIC_BASE_URL，或由反向代理传入 X-Forwarded-Proto / X-Forwarded-Host",
            url_diag.get("reason"),
            url_diag.get("source"),
            url_diag.get("base_url"),
        )
    if try_mimo_video_url:
        try:
            video_url_mimo = _store_temp_video_and_build_url(request, video_bytes, mime)
            raw = await _video_url_quick_call(client, video_url_mimo)
            if isinstance(raw, dict):
                result = raw
            logger.info("视频快识 video_url 完成 keys=%s", list(result.keys()))
        except Exception as e:
            logger.warning("视频快识 video_url 失败，将尝试抽帧: %s", e)
            result = {}

    if not isinstance(result, dict):
        result = {}

    _normalize_quick_recognition_fields(result)
    _sanitize_video_derived_title(result)
    _sanitize_video_meta_narrative_content(result)

    if video_url_mimo:
        try:
            lines = await _video_url_subtitle_transcript_call(client, video_url_mimo)
            _merge_subtitle_transcript_into_result(result, lines)
        except Exception as e:
            logger.warning("视频快识专向听写失败: %s", e)
        _sanitize_video_derived_title(result)
        _sanitize_video_meta_narrative_content(result)

    frame_jpeg: Optional[bytes] = None
    if _video_subtitle_payload_insufficient(result):
        frame_jpeg = _extract_first_video_frame(video_bytes, container_ext)
        if frame_jpeg:
            try:
                img_bytes, img_mime = _prepare_quick_recognize_image(frame_jpeg)
                fp = _QUICK_PROMPT + (
                    "\n## 视频代表帧专规（优先于上文）\n"
                    "输入为视频暂停画面；**忽略画面中央的播放按钮图标**（UI 装饰，不是字幕）。\n"
                    "**content_text 只许写画面上字幕/花字/贴纸的逐字原文**，多行用换行分隔；"
                    "一句一行，与画面中字形一致，不要意译成长句。\n"
                    "**绝对禁止**在 content_text 里写：「视频帧显示」「画面中一位」「并叠加字幕提示」"
                    "「视频展示了」等**场景旁白**；旁白式内容若必须输出，只能放在 summary（一句以内）。\n"
                    "**title 留空 \"\"**，除非出现发布页标题栏。\n"
                    "slot_type 判为 content（有字幕/花字时）。无可见文字时 content_text 为 \"\"。\n"
                    "完整视频的逐句口播需整段 video_url 理解；本帧仅 OCR 可见花字。"
                )
                fr = await _vision_call(
                    client, fp, img_bytes, max_out_tokens=quick_max_out, image_mime=img_mime
                )
                if isinstance(fr, dict) and not fr.get("error"):
                    result = fr
                    _normalize_quick_recognition_fields(result, is_video_frame_fallback=True)
                    _sanitize_video_derived_title(result)
                    _sanitize_video_meta_narrative_content(result)
                    logger.info("视频快识抽帧视觉完成 slot_type=%s", result.get("slot_type"))
                elif isinstance(fr, dict) and fr.get("error"):
                    logger.warning("视频快识抽帧视觉失败: %s", fr.get("error"))
            except Exception as e:
                logger.warning("视频快识抽帧视觉失败: %s", e)

    if frame_jpeg is None and (
        not str(result.get("title", "")).strip()
        or not str(result.get("content_text", "")).strip()
        or _content_text_looks_like_video_scene_caption(str(result.get("content_text", "")).strip())
        or _video_title_body_same_short_hook(result)
    ):
        frame_jpeg = _extract_first_video_frame(video_bytes, container_ext)
    if frame_jpeg:
        await _ocr_supplement_quick_result(client, frame_jpeg, result, ocr_cap)

    stt_text = ""
    try:
        _stt_t = float(os.getenv("VIDEO_STT_TIMEOUT_SEC", "240"))
    except ValueError:
        _stt_t = 240.0
    stt_timeout = max(30.0, min(_stt_t, 600.0))
    try:
        stt_text = await asyncio.wait_for(stt_task, timeout=stt_timeout)
    except asyncio.TimeoutError:
        logger.warning("VIDEO_STT: Whisper 等待超时（%.0fs）", stt_timeout)
        stt_task.cancel()
        try:
            await stt_task
        except asyncio.CancelledError:
            pass
    except Exception as e:
        logger.warning("VIDEO_STT: 合并前异常 %s", e)

    _prev_ct_len = len(str(result.get("content_text", "") or ""))
    _merge_stt_into_video_result(result, stt_text)
    _after_ct_len = len(str(result.get("content_text", "") or ""))
    logger.info(
        "VIDEO_STT: 口播合并 prev_content_len=%s stt_len=%s merged_content_len=%s",
        _prev_ct_len,
        len((stt_text or "").strip()),
        _after_ct_len,
    )
    _stt_env_on = os.getenv("VIDEO_STT_ENABLED", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if not (stt_text or "").strip() and _stt_env_on:
        logger.warning(
            "VIDEO_STT: 口播转写为空，正文仍主要来自视频模型/OCR；"
            "请看上方 VIDEO_STT 日志（ffmpeg、API、代理已改为 trust_env=False 直连）",
        )

    _sanitize_video_meta_narrative_content(result)

    if _quick_payload_is_empty(result):
        return {
            "success": False,
            "error": "无法从视频中识别有效文字或主题，请换片段或手动填写",
            "media_source": "video",
            "slot_type": "other",
            "extra_slots": [],
            "category": "",
            "summary": "",
            "title": "",
            "content_text": "",
            "confidence": 0.0,
        }

    _sanitize_video_derived_title(result)
    _sanitize_video_meta_narrative_content(result)
    _coerce_video_quick_slot_when_body_present(result)

    logger.info(
        "视频快识最终结果: slot_type=%s title=%s category=%s",
        result.get("slot_type"),
        str(result.get("title", ""))[:50],
        result.get("category", ""),
    )
    out = {"success": True, **result}
    out["media_source"] = "video"
    return out


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
            raise HTTPException(400, f"视频不能超过 {MAX_VIDEO_SIZE // (1024 * 1024)}MB")
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
