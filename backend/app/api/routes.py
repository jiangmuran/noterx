"""
API 路由定义
"""
from fastapi import APIRouter

from app.api.diagnose import router as diagnose_router
from app.api.baseline_api import router as baseline_router
from app.api.link_api import router as link_router
from app.api.comments_api import router as comments_router
from app.api.history_api import router as history_router
from app.api.screenshot_api import router as screenshot_router

router = APIRouter()
router.include_router(diagnose_router, tags=["diagnose"])
router.include_router(baseline_router, tags=["baseline"])
router.include_router(link_router, tags=["link"])
router.include_router(comments_router, tags=["comments"])
router.include_router(history_router, tags=["history"])
router.include_router(screenshot_router, tags=["screenshot"])
