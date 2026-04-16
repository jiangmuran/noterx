"""
轻量使用追踪 — 无需登录，基于 IP 匿名追踪
"""
from __future__ import annotations

import logging
import os
import sqlite3
from typing import Optional

from fastapi import Request

logger = logging.getLogger("noterx.usage")
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "baseline.db")


def get_client_ip(request: Request) -> str:
    """Extract real client IP from proxy headers."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip", "")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def log_usage(
    ip: str,
    action: str = "diagnose",
    title: str = "",
    category: str = "",
    total_tokens: int = 0,
    duration_sec: float = 0,
    status: str = "ok",
) -> None:
    """Write a usage log entry to SQLite."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO usage_log (ip, action, title, category, total_tokens, duration_sec, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (ip, action, title[:100], category, total_tokens, round(duration_sec, 1), status),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning("Failed to log usage: %s", e)
