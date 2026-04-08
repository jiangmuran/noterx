"""
NoteRx 后端入口
"""
import logging
import os
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.routes import router as api_router
from app import local_memory

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "baseline.db")


def _ensure_history_table():
    """启动时自动创建 diagnosis_history 表（如不存在）"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS diagnosis_history (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            overall_score REAL,
            grade TEXT,
            report_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_history_created
        ON diagnosis_history(created_at DESC)
    """)
    conn.commit()
    conn.close()
    local_memory.ensure_memory_md()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """应用生命周期：启动时自动建表"""
    _ensure_history_table()
    yield

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title="NoteRx API",
    description="AI驱动的小红书笔记诊断平台",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

# ── Landing page: research whitepaper at / ──
RESEARCH_HTML = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "research_whitepaper.html")

@app.get("/")
async def serve_landing():
    """首页 → 研究白皮书着陆页"""
    if os.path.isfile(RESEARCH_HTML):
        return FileResponse(RESEARCH_HTML, media_type="text/html")
    # Fallback: serve SPA if whitepaper not found
    if os.path.isdir(FRONTEND_DIST):
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
    return {"status": "ok", "service": "NoteRx API"}

@app.get("/research")
async def serve_research():
    """兼容旧链接"""
    if os.path.isfile(RESEARCH_HTML):
        return FileResponse(RESEARCH_HTML, media_type="text/html")
    return {"error": "Research page not found"}

# ── SPA: product app at /app and sub-routes ──
SPA_ROUTES = {"/app", "/diagnosing", "/report", "/history", "/screenshot"}

if os.path.isdir(FRONTEND_DIST):
    from starlette.middleware.base import BaseHTTPMiddleware

    class SPAMiddleware(BaseHTTPMiddleware):
        """Serve SPA index.html for /app and its sub-routes"""
        async def dispatch(self, request, call_next):
            response = await call_next(request)
            path = request.url.path
            if (response.status_code == 404
                    and not path.startswith("/api")
                    and not path.startswith("/assets")
                    and path not in ("/", "/research")):
                return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
            return response

    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="static")
    app.add_middleware(SPAMiddleware)

    @app.get("/app")
    async def serve_app():
        """产品主页面"""
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


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
