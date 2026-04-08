"""
Note diagnose API.
"""
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

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, Query
from fastapi.responses import FileResponse

from app.models.schemas import DiagnoseResponse

router = APIRouter()
logger = logging.getLogger("noterx.diagnose")

MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10 MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100 MB upload cap
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-ms-wmv"}
MIMO_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv"}
ALLOWED_MIME = ALLOWED_IMAGE_MIME | ALLOWED_VIDEO_MIME

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


def _extract_cover_frame(video_bytes: bytes) -> Optional[bytes]:
    """Extract first frame from uploaded video and return JPEG bytes."""
    try:
        import cv2  # type: ignore
    except Exception:
        return None

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            tmp.write(video_bytes)
            temp_path = tmp.name

        cap = cv2.VideoCapture(temp_path)
        ok, frame = cap.read()
        cap.release()
        if not ok or frame is None:
            return None

        ok, encoded = cv2.imencode(".jpg", frame)
        if not ok:
            return None
        return encoded.tobytes()
    except Exception:
        return None
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


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


@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose_note(
    request: Request,
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form(...),
    tags: str = Form(""),
    cover_image: Optional[UploadFile] = File(None),
):
    """
    Accept note data and run diagnosis.
    - image upload: supports OCR fallback when title is empty
    - video upload: stores a signed temp URL on this server for MiMo video_url input
    """
    from app.agents.orchestrator import Orchestrator

    image_bytes: Optional[bytes] = None
    is_video = False
    video_analysis: Optional[dict] = None

    if cover_image:
        mime = cover_image.content_type or ""
        if mime and mime not in ALLOWED_MIME:
            raise HTTPException(400, f"不支持的文件格式: {mime}")

        is_video = mime in ALLOWED_VIDEO_MIME
        max_size = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE
        file_bytes = await cover_image.read()

        if len(file_bytes) > max_size:
            limit_label = "100MB" if is_video else "10MB"
            raise HTTPException(400, f"文件大小不能超过 {limit_label}")

        if not is_video:
            image_bytes = file_bytes
        else:
            image_bytes = _extract_cover_frame(file_bytes)
            if image_bytes is None:
                logger.info("Video frame extraction failed, visual baseline may fallback")

            mime_for_video = mime or "video/mp4"
            logger.info("Detected video upload (%s), trying MiMo video understanding via signed temp URL", mime_for_video)

            if mime_for_video not in MIMO_VIDEO_MIME:
                logger.info("Video mime %s is outside MiMo documented video types; skip direct video understanding", mime_for_video)
            else:
                try:
                    from app.analysis.video_analyzer import VideoAnalyzer

                    video_url = _store_temp_video_and_build_url(request, file_bytes, mime_for_video)
                    analyzer = VideoAnalyzer()
                    video_analysis = await analyzer.analyze(
                        video_url,
                        prompt_hint=f"title={title[:80]} | category={category}",
                    )
                except Exception as e:
                    logger.warning("Video understanding failed, fallback to title/content inference: %s", e)

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    if image_bytes and not title.strip():
        logger.info("Title is empty, trying OCR extraction...")
        from app.analysis.ocr_processor import OCRProcessor
        from app.agents.base_agent import _get_client

        ocr = OCRProcessor()
        ocr_result = await ocr.extract_text(image_bytes, client=_get_client())
        if ocr_result.get("title"):
            title = ocr_result["title"]
        if not content.strip() and ocr_result.get("content"):
            content = ocr_result["content"]
        if not tag_list and ocr_result.get("tags"):
            tag_list = ocr_result["tags"]
        logger.info("OCR result: title=%s, tags=%s", title[:30] if title else "", tag_list)

    if not title.strip():
        raise HTTPException(400, "请输入笔记标题或上传包含标题的截图")

    orchestrator = Orchestrator()
    report = await orchestrator.run(
        title=title,
        content=content,
        category=category,
        tags=tag_list,
        cover_image=image_bytes,
        video_analysis=video_analysis,
    )
    return report


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Upload cover image and return image-analysis result."""
    if file.content_type and file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(400, f"不支持的图片格式: {file.content_type}")

    from app.analysis.image_analyzer import ImageAnalyzer

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "图片大小不能超过 10MB")

    analyzer = ImageAnalyzer()
    result = analyzer.analyze(image_bytes)
    return result
