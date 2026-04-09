"""
Baseline data query API.
"""
from fastapi import APIRouter

from app.baseline.comparator import BaselineComparator

router = APIRouter()


def _flatten_baseline_payload(payload: dict) -> dict:
    stats = payload.get("stats", {}) if isinstance(payload, dict) else {}
    if not isinstance(stats, dict):
        stats = {}
    return {
        "category": payload.get("category"),
        "stats": stats,
        **stats,
    }


@router.get("/baseline/{category}")
async def get_baseline(category: str):
    """Return category baseline stats."""
    comparator = BaselineComparator()
    stats = comparator.get_category_stats(category)
    return _flatten_baseline_payload(stats)
