"""Note diagnose API routes."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse

from app.models.schemas import DiagnoseResponse

router = APIRouter()
logger = logging.getLogger("noterx.diagnose")

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200 MB
MAX_IMAGE_COUNT = 9
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo", "video/x-ms-wmv"}
MIMO_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv"}

MIME_TO_EXT = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
    "video/x-ms-wmv": ".wmv",
    "video/webm": ".webm",
}
VIDEO_FILE_RE = re.compile(r"^[a-f0-9]{32}_[0-9]{10}\.(mp4|mov|avi|wmv|webm)$")
TEMP_VIDEO_TTL_SECONDS = int(os.getenv("TEMP_VIDEO_TTL_SECONDS", "900"))
TEMP_VIDEO_SIGNING_KEY = os.getenv("TEMP_VIDEO_SIGNING_KEY", "dev-change-me")
TEMP_VIDEO_PUBLIC_BASE_URL = os.getenv("MIMO_VIDEO_PUBLIC_BASE_URL", "").strip().rstrip("/")
TEMP_VIDEO_DIR = Path(
    os.getenv(
        "TEMP_VIDEO_DIR",
        str(Path(__file__).resolve().parents[2] / "data" / "temp_videos"),
    )
)


def _extract_first_video_frame(video_bytes: bytes) -> Optional[bytes]:
    """Extract the first frame from video bytes as JPEG bytes."""
    try:
        import cv2
    except Exception:
        logger.warning("OpenCV unavailable; skip extracting video frame")
        return None

    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
            temp_file.write(video_bytes)
            temp_path = temp_file.name

        capture = cv2.VideoCapture(temp_path)
        ok, frame = capture.read()
        capture.release()
        if not ok:
            return None

        encode_ok, encoded = cv2.imencode(".jpg", frame)
        if not encode_ok:
            return None
        return encoded.tobytes()
    except Exception as exc:
        logger.warning("Extract video frame failed: %s", exc)
        return None
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                logger.warning("Failed to remove temp file: %s", temp_path)


async def _read_and_validate_image(file: UploadFile, field_name: str) -> bytes:
    if file.content_type and file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(400, f"不支持的图片格式（{field_name}）：{file.content_type}")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(400, f"{field_name} 超过 {MAX_IMAGE_SIZE // (1024 * 1024)}MB 限制")
    return image_bytes


async def _read_and_validate_video(file: UploadFile) -> bytes:
    if file.content_type and file.content_type not in ALLOWED_VIDEO_MIME:
        raise HTTPException(400, f"不支持的视频格式：{file.content_type}")

    video_bytes = await file.read()
    if len(video_bytes) > MAX_VIDEO_SIZE:
        raise HTTPException(400, f"video_file 超过 {MAX_VIDEO_SIZE // (1024 * 1024)}MB 限制")
    return video_bytes


# ─── Temp video URL serving (for MiMo video_url mode) ───

def _ensure_temp_video_dir() -> None:
    TEMP_VIDEO_DIR.mkdir(parents=True, exist_ok=True)


def _sign_temp_video(file_name: str, exp: int) -> str:
    payload = f"{file_name}:{exp}".encode("utf-8")
    return hmac.new(TEMP_VIDEO_SIGNING_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _cleanup_expired_temp_videos(now_ts: Optional[int] = None) -> None:
    _ensure_temp_video_dir()
    now = now_ts or int(time.time())
    for item in TEMP_VIDEO_DIR.iterdir():
        if not item.is_file():
            continue
        name = item.name
        if not VIDEO_FILE_RE.fullmatch(name):
            continue
        exp_str = name.split("_", 1)[1].split(".", 1)[0]
        try:
            exp = int(exp_str)
        except ValueError:
            continue
        if exp < now - 60:
            try:
                item.unlink(missing_ok=True)
            except Exception:
                logger.warning("Failed to delete expired temp video: %s", item)


def _build_public_base_url(request: Request) -> str:
    if TEMP_VIDEO_PUBLIC_BASE_URL:
        return TEMP_VIDEO_PUBLIC_BASE_URL
    return str(request.base_url).rstrip("/")


def _store_temp_video_and_build_url(request: Request, video_bytes: bytes, mime: str) -> str:
    _cleanup_expired_temp_videos()
    _ensure_temp_video_dir()

    now = int(time.time())
    exp = now + max(60, TEMP_VIDEO_TTL_SECONDS)
    ext = MIME_TO_EXT.get(mime, ".mp4")
    file_name = f"{uuid.uuid4().hex}_{exp}{ext}"
    file_path = TEMP_VIDEO_DIR / file_name
    file_path.write_bytes(video_bytes)

    sig = _sign_temp_video(file_name, exp)
    base = _build_public_base_url(request)
    return f"{base}/api/temp-video/{file_name}?exp={exp}&sig={sig}"


@router.get("/temp-video/{file_name}")
async def get_temp_video(
    file_name: str,
    exp: int = Query(...),
    sig: str = Query(...),
):
    if not VIDEO_FILE_RE.fullmatch(file_name):
        raise HTTPException(400, "invalid file name")

    expected_sig = _sign_temp_video(file_name, exp)
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(403, "invalid signature")

    if exp < int(time.time()):
        raise HTTPException(410, "video url expired")

    file_path = TEMP_VIDEO_DIR / file_name
    if not file_path.exists():
        raise HTTPException(404, "video not found")

    ext = file_path.suffix.lower()
    media_type = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".wmv": "video/x-ms-wmv",
        ".webm": "video/webm",
    }.get(ext, "application/octet-stream")
    return FileResponse(path=file_path, media_type=media_type, filename=file_name)


# ─── Main diagnose endpoint ───

@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose_note(
    request: Request,
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form(...),
    tags: str = Form(""),
    cover_image: Optional[UploadFile] = File(None),
    cover_images: Optional[list[UploadFile]] = File(None),
    video_file: Optional[UploadFile] = File(None),
):
    """Receive note content and run multi-agent diagnosis."""
    from app.agents.orchestrator import Orchestrator

    # Collect image files
    image_files: list[UploadFile] = []
    if cover_image is not None:
        image_files.append(cover_image)
    if cover_images:
        image_files.extend(cover_images)

    if len(image_files) > MAX_IMAGE_COUNT:
        raise HTTPException(400, f"最多只允许上传 {MAX_IMAGE_COUNT} 张图片")

    parsed_images: list[bytes] = []
    for index, image in enumerate(image_files):
        parsed_images.append(await _read_and_validate_image(image, f"cover_images[{index}]"))

    video_bytes: Optional[bytes] = None
    if video_file is not None:
        video_bytes = await _read_and_validate_video(video_file)

    image_bytes = parsed_images[0] if parsed_images else None
    if len(parsed_images) > 1:
        logger.info("Received %d images; use first image as cover for current pipeline", len(parsed_images))

    # Video analysis via MiMo omni
    video_analysis: Optional[dict] = None

    if image_bytes is None and video_bytes is not None:
        # Extract first frame as fallback cover image
        extracted = _extract_first_video_frame(video_bytes)
        if extracted is not None:
            image_bytes = extracted
            logger.info("Using first frame from video for visual analysis")
        else:
            logger.info("Video frame extraction failed, visual baseline may fallback")

        # Try MiMo video understanding via signed temp URL
        mime_for_video = (video_file.content_type if video_file else None) or "video/mp4"
        if mime_for_video in MIMO_VIDEO_MIME:
            logger.info("Trying MiMo video understanding via signed temp URL (%s)", mime_for_video)
            try:
                from app.analysis.video_analyzer import VideoAnalyzer

                video_url = _store_temp_video_and_build_url(request, video_bytes, mime_for_video)
                analyzer = VideoAnalyzer()
                video_analysis = await analyzer.analyze(
                    video_url,
                    prompt_hint=f"title={title[:80]} | category={category}",
                )
            except Exception as e:
                logger.warning("Video understanding failed, fallback to title/content inference: %s", e)
        else:
            logger.info("Video mime %s outside MiMo supported types; skip video understanding", mime_for_video)

    tag_list = [token.strip() for token in tags.split(",") if token.strip()] if tags else []

    if image_bytes and not title.strip():
        logger.info("Title is empty; trying OCR")
        from app.agents.base_agent import _get_client
        from app.analysis.ocr_processor import OCRProcessor

        ocr = OCRProcessor()
        ocr_result = await ocr.extract_text(image_bytes, client=_get_client())
        if ocr_result.get("title"):
            title = ocr_result["title"]
        if not content.strip() and ocr_result.get("content"):
            content = ocr_result["content"]
        if not tag_list and ocr_result.get("tags"):
            tag_list = ocr_result["tags"]
        logger.info("OCR output: title=%s, tags=%s", title[:30] if title else "", tag_list)

    if not title.strip():
        raise HTTPException(400, "请输入标题，或上传可识别标题的图片/视频")

    orchestrator = Orchestrator()
    report = await orchestrator.run(
        title=title,
        content=content,
        category=category,
        tags=tag_list,
        cover_image=image_bytes,
        image_count=len(parsed_images),
        video_analysis=video_analysis,
    )
    return report


@router.post("/pre-score")
async def pre_score_note(
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form("lifestyle"),
    tags: str = Form(""),
    image_count: int = Form(0),
):
    """Instant Model A pre-score (no LLM, pure math, <50ms)."""
    from app.agents.research_data import pre_score, MODEL_PARAMS, CATEGORY_CN

    tag_count = len([t for t in tags.split(",") if t.strip()]) if tags else 0
    result = pre_score(title, content, category, tag_count, image_count)
    result["category"] = category
    result["category_cn"] = CATEGORY_CN.get(category, category)
    return result


@router.post("/diagnose-stream")
async def diagnose_stream(
    request: Request,
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form(...),
    tags: str = Form(""),
    cover_image: Optional[UploadFile] = File(None),
    cover_images: Optional[list[UploadFile]] = File(None),
    video_file: Optional[UploadFile] = File(None),
):
    """SSE streaming diagnosis — sends progress events as agents complete."""
    import asyncio
    import json as json_mod
    from starlette.responses import StreamingResponse
    from app.agents.orchestrator import Orchestrator
    from app.agents.research_data import pre_score as _pre_score

    # Parse inputs (same as /diagnose)
    image_files: list[UploadFile] = []
    if cover_image is not None:
        image_files.append(cover_image)
    if cover_images:
        image_files.extend(cover_images)
    if len(image_files) > MAX_IMAGE_COUNT:
        raise HTTPException(400, f"最多只允许上传 {MAX_IMAGE_COUNT} 张图片")

    parsed_images: list[bytes] = []
    for index, image in enumerate(image_files):
        parsed_images.append(await _read_and_validate_image(image, f"cover_images[{index}]"))

    video_bytes: Optional[bytes] = None
    if video_file is not None:
        video_bytes = await _read_and_validate_video(video_file)

    image_bytes = parsed_images[0] if parsed_images else None

    video_analysis: Optional[dict] = None
    if image_bytes is None and video_bytes is not None:
        extracted = _extract_first_video_frame(video_bytes)
        if extracted is not None:
            image_bytes = extracted

        mime_for_video = (video_file.content_type if video_file else None) or "video/mp4"
        if mime_for_video in MIMO_VIDEO_MIME:
            try:
                from app.analysis.video_analyzer import VideoAnalyzer
                video_url = _store_temp_video_and_build_url(request, video_bytes, mime_for_video)
                analyzer = VideoAnalyzer()
                video_analysis = await analyzer.analyze(video_url, prompt_hint=f"title={title[:80]} | category={category}")
            except Exception as e:
                logger.warning("Video understanding failed: %s", e)

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    if image_bytes and not title.strip():
        from app.agents.base_agent import _get_client
        from app.analysis.ocr_processor import OCRProcessor
        ocr = OCRProcessor()
        ocr_result = await ocr.extract_text(image_bytes, client=_get_client())
        if ocr_result.get("title"):
            title = ocr_result["title"]
        if not content.strip() and ocr_result.get("content"):
            content = ocr_result["content"]
        if not tag_list and ocr_result.get("tags"):
            tag_list = ocr_result["tags"]

    if not title.strip():
        raise HTTPException(400, "请输入标题，或上传可识别标题的图片/视频")

    # --- SSE generator ---
    async def event_generator():
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json_mod.dumps(data, ensure_ascii=False)}\n\n"

        # 1) Instant pre-score
        score = _pre_score(title, content, category, len(tag_list),
                           image_bytes is not None and 1 or 0)
        yield sse("pre_score", {"title": title, "category": category, **score})

        # 2) Run orchestrator with realtime progress callbacks
        orchestrator = Orchestrator()
        queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()

        async def _progress(step: str, message: str):
            await queue.put(("progress", {"step": step, "message": message}))

        async def _run_job():
            try:
                report = await orchestrator.run(
                    title=title,
                    content=content,
                    category=category,
                    tags=tag_list,
                    cover_image=image_bytes,
                    image_count=len(parsed_images),
                    video_analysis=video_analysis,
                    progress_cb=_progress,
                )
                await queue.put(("result", report))
            except Exception as e:
                logger.error("Stream diagnose error: %s", e)
                await queue.put(("error", {"message": str(e)}))
            finally:
                await queue.put(("done", {}))

        task = asyncio.create_task(_run_job())
        try:
            while True:
                event, data = await queue.get()
                if event == "done":
                    break
                yield sse(event, data)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Upload one image and return visual analysis result."""
    from app.analysis.image_analyzer import ImageAnalyzer

    image_bytes = await _read_and_validate_image(file, "file")
    analyzer = ImageAnalyzer()
    return analyzer.analyze(image_bytes)
