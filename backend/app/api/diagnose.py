"""
笔记诊断 API
"""
import logging

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional

from app.models.schemas import DiagnoseResponse

router = APIRouter()
logger = logging.getLogger("noterx.diagnose")

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose_note(
    title: str = Form(""),
    content: str = Form(""),
    category: str = Form(...),
    tags: str = Form(""),
    cover_image: Optional[UploadFile] = File(None),
):
    """
    接收笔记内容，执行多Agent诊断，返回诊断报告。
    若仅上传图片而无标题，自动调用 OCR 提取。

    @param title - 笔记标题（截图模式可为空，由 OCR 填充）
    @param content - 笔记正文
    @param category - 垂类 (food / fashion / tech)
    @param tags - 标签，逗号分隔
    @param cover_image - 封面/截图图片（可选）
    """
    from app.agents.orchestrator import Orchestrator

    image_bytes = None
    if cover_image:
        if cover_image.content_type and cover_image.content_type not in ALLOWED_MIME:
            raise HTTPException(400, f"不支持的图片格式: {cover_image.content_type}")
        image_bytes = await cover_image.read()
        if len(image_bytes) > MAX_IMAGE_SIZE:
            raise HTTPException(400, "图片大小不能超过 10MB")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    if image_bytes and not title.strip():
        logger.info("标题为空，尝试 OCR 提取...")
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
        logger.info("OCR 结果: title=%s, tags=%s", title[:30] if title else "", tag_list)

    if not title.strip():
        raise HTTPException(400, "请输入笔记标题或上传包含标题的截图")

    orchestrator = Orchestrator()
    report = await orchestrator.run(
        title=title,
        content=content,
        category=category,
        tags=tag_list,
        cover_image=image_bytes,
    )
    return report


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """上传封面图片，返回图像分析结果"""
    if file.content_type and file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"不支持的图片格式: {file.content_type}")

    from app.analysis.image_analyzer import ImageAnalyzer

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "图片大小不能超过 10MB")

    analyzer = ImageAnalyzer()
    result = analyzer.analyze(image_bytes)
    return result
