"""
Baseline API contract tests.
"""
import os
import sqlite3
import sys
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.api.baseline_api import router as baseline_router
from app.baseline.comparator import BaselineComparator


def _create_test_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE notes (
            id INTEGER PRIMARY KEY, category TEXT, title TEXT,
            title_length INTEGER, content TEXT, tags TEXT,
            publish_hour INTEGER, likes INTEGER, collects INTEGER,
            comments INTEGER, followers INTEGER, is_viral INTEGER,
            cover_has_face INTEGER, cover_text_ratio REAL, cover_saturation REAL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE baseline_stats (
            id INTEGER PRIMARY KEY, category TEXT, metric_name TEXT,
            metric_value REAL, metric_json TEXT, updated_at TIMESTAMP,
            UNIQUE(category, metric_name)
        )
        """
    )
    cursor.execute(
        """
        INSERT INTO baseline_stats (category, metric_name, metric_value)
        VALUES ('food', 'avg_title_length', 15.5)
        """
    )
    cursor.execute(
        """
        INSERT INTO baseline_stats (category, metric_name, metric_value)
        VALUES ('food', 'avg_tag_count', 5.2)
        """
    )
    conn.commit()
    conn.close()
    return path


def test_get_category_stats():
    db = _create_test_db()
    try:
        comparator = BaselineComparator(db_path=db)
        stats = comparator.get_category_stats("food")
        assert stats["category"] == "food"
        assert "stats" in stats
        assert stats["stats"]["avg_title_length"] == 15.5
    finally:
        os.unlink(db)


def test_compare_returns_comparisons():
    db = _create_test_db()
    try:
        comparator = BaselineComparator(db_path=db)
        result = comparator.compare(
            "food",
            {
                "title_length": 10,
                "tag_count": 3,
                "tags": ["缇庨"],
            },
        )
        assert "comparisons" in result
        assert "title_length" in result["comparisons"]
        assert result["comparisons"]["title_length"]["user_value"] == 10
    finally:
        os.unlink(db)


def test_compare_unknown_category():
    db = _create_test_db()
    try:
        comparator = BaselineComparator(db_path=db)
        result = comparator.compare("unknown", {"title_length": 10, "tag_count": 0, "tags": []})
        assert result["category"] == "unknown"
    finally:
        os.unlink(db)


def test_baseline_route_returns_flat_and_nested_payload(monkeypatch):
    class StubComparator:
        def get_category_stats(self, category: str):
            return {
                "category": category,
                "stats": {
                    "avg_title_length": 15.5,
                    "viral_avg_title_length": 18.2,
                    "avg_tag_count": 5.0,
                },
            }

    from app.api import baseline_api

    monkeypatch.setattr(baseline_api, "BaselineComparator", lambda: StubComparator())

    app = FastAPI()
    app.include_router(baseline_router)
    client = TestClient(app)

    response = client.get("/baseline/food")
    assert response.status_code == 200
    payload = response.json()
    assert payload["category"] == "food"
    assert payload["stats"]["avg_title_length"] == 15.5
    assert payload["avg_title_length"] == 15.5
    assert payload["viral_avg_title_length"] == 18.2
