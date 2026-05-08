"""
NoteRx 后端入口
"""
import logging
import os
import sqlite3
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.routes import router as api_router
from app import local_memory

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "baseline.db")

_MAX_REQUEST_BODY_MB = int(os.getenv("MAX_REQUEST_BODY_MB", "350"))
_MAX_REQUEST_BODY_BYTES = max(1, min(_MAX_REQUEST_BODY_MB, 2048)) * 1024 * 1024

_RATE_LIMIT_WINDOW = int(os.getenv("API_RATE_LIMIT_WINDOW_SEC", "60"))
_RATE_LIMIT_MAX = int(os.getenv("API_RATE_LIMIT_PER_WINDOW", "30"))
_DIAGNOSE_RATE_LIMIT = int(os.getenv("DIAGNOSE_RATE_LIMIT_PER_WINDOW", "8"))
_rate_limit_store: dict[str, list[float]] = {}


def _check_rate_limit(identifier: str, window: int, max_req: int) -> bool:
    now = time.time()
    if identifier not in _rate_limit_store:
        _rate_limit_store[identifier] = []
    timestamps = _rate_limit_store[identifier]
    timestamps[:] = [ts for ts in timestamps if now - ts < window]
    if len(timestamps) >= max_req:
        return False
    timestamps.append(now)
    return True


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
    # Usage tracking table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'diagnose',
            title TEXT DEFAULT '',
            category TEXT DEFAULT '',
            total_tokens INTEGER DEFAULT 0,
            duration_sec REAL DEFAULT 0,
            status TEXT DEFAULT 'ok',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_ip ON usage_log(ip)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS visit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_hash TEXT NOT NULL,
            user_agent_hash TEXT DEFAULT '',
            path TEXT NOT NULL,
            referrer TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_visit_created ON visit_log(created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_visit_visitor ON visit_log(visitor_hash)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_visit_path ON visit_log(path)")
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
    allow_origins=[
        os.getenv("CORS_ORIGIN_OVERRIDE", "").strip() or "https://noterx.muran.tech",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# ── Rate limiting middleware ──
from starlette.middleware.base import BaseHTTPMiddleware

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/admin"):
            return await call_next(request)
        if not path.startswith("/api"):
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        if path in ("/api/diagnose", "/api/diagnose-stream", "/api/optimize", "/api/screenshot/quick-recognize"):
            max_req = _DIAGNOSE_RATE_LIMIT
        else:
            max_req = _RATE_LIMIT_MAX
        if not _check_rate_limit(ip, _RATE_LIMIT_WINDOW, max_req):
            raise HTTPException(429, "请求过于频繁，请稍后重试")
        return await call_next(request)

app.add_middleware(RateLimitMiddleware)

# ── Request body size limit middleware ──
class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api"):
            return await call_next(request)
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                cl = int(content_length)
                if cl > _MAX_REQUEST_BODY_BYTES:
                    raise HTTPException(413, f"请求体超过 {_MAX_REQUEST_BODY_MB}MB 限制")
            except ValueError:
                pass
        return await call_next(request)

app.add_middleware(BodySizeLimitMiddleware)

app.include_router(api_router, prefix="/api")

# Admin panel at /admin (no /api prefix)
from app.api.admin_api import router as admin_router
app.include_router(admin_router)

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

# ── Legal pages ──
TERMS_HTML = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "terms.html")
PRIVACY_HTML = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "privacy.html")

@app.get("/terms")
async def serve_terms():
    """服务条款"""
    if os.path.isfile(TERMS_HTML):
        return FileResponse(TERMS_HTML, media_type="text/html")
    return {"error": "Terms page not found"}

@app.get("/privacy")
async def serve_privacy():
    """隐私政策"""
    if os.path.isfile(PRIVACY_HTML):
        return FileResponse(PRIVACY_HTML, media_type="text/html")
    return {"error": "Privacy page not found"}

# ── SPA: product app at /app and sub-routes ──
SPA_ROUTES = {"/app", "/diagnosing", "/report", "/history", "/screenshot"}

if os.path.isdir(FRONTEND_DIST):
    class SPAMiddleware(BaseHTTPMiddleware):
        """Serve SPA index.html for /app and its sub-routes"""
        async def dispatch(self, request, call_next):
            response = await call_next(request)
            path = request.url.path
            if (response.status_code == 404
                    and not path.startswith("/api")
                    and not path.startswith("/assets")
                    and path not in ("/", "/research", "/terms", "/privacy")
                    and not path.startswith("/admin")):
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
