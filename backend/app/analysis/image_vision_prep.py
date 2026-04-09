"""
将封面压缩为 JPEG，供多模态 LLM 使用（控制体积与 token）。
"""
from __future__ import annotations

import io
import os

from PIL import Image


def jpeg_bytes_for_vision(image_bytes: bytes) -> bytes:
    """
    将任意常见图片转为 RGB JPEG；长边超过 VISION_MAX_EDGE 时等比缩小。

    @param image_bytes - 原始图片二进制
    @returns JPEG 字节（MIME 为 image/jpeg）
    """
    max_edge = int(os.getenv("VISION_MAX_EDGE", "1280"))
    max_edge = max(256, min(max_edge, 4096))
    quality = int(os.getenv("VISION_JPEG_QUALITY", "85"))
    quality = max(60, min(quality, 95))

    im = Image.open(io.BytesIO(image_bytes))
    im = im.convert("RGB")
    w, h = im.size
    m = max(w, h)
    if m > max_edge:
        scale = max_edge / m
        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()
