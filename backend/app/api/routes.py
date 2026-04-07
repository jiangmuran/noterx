"""
API 路由定义
"""
from fastapi import APIRouter

from app.api.diagnose import router as diagnose_router
from app.api.baseline_api import router as baseline_router
from app.api.link_api import router as link_router

router = APIRouter()
router.include_router(diagnose_router, tags=["diagnose"])
router.include_router(baseline_router, tags=["baseline"])
router.include_router(link_router, tags=["link"])
