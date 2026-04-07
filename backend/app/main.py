"""
NoteRx 后端入口
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title="NoteRx API",
    description="AI驱动的小红书笔记诊断平台",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    """健康检查"""
    return {"status": "ok", "service": "NoteRx API"}


@app.get("/api/health")
async def health():
    """详细健康检查，含数据库探测"""
    import sqlite3
    import os
    db_path = os.path.join(os.path.dirname(__file__), "..", "data", "baseline.db")
    db_ok = False
    note_count = 0
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM notes")
        note_count = cur.fetchone()[0]
        conn.close()
        db_ok = True
    except Exception:
        pass
    return {
        "status": "ok" if db_ok else "degraded",
        "database": {"connected": db_ok, "note_count": note_count},
    }
