"""
Baseline API 契约测试
"""
import sqlite3
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.baseline.comparator import BaselineComparator


def _create_test_db():
    """创建临时测试数据库"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    conn = sqlite3.connect(path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE notes (
            id INTEGER PRIMARY KEY, category TEXT, title TEXT,
            title_length INTEGER, content TEXT, tags TEXT,
            publish_hour INTEGER, likes INTEGER, collects INTEGER,
            comments INTEGER, followers INTEGER, is_viral INTEGER,
            cover_has_face INTEGER, cover_text_ratio REAL, cover_saturation REAL
        )
    """)
    c.execute("""
        CREATE TABLE baseline_stats (
            id INTEGER PRIMARY KEY, category TEXT, metric_name TEXT,
            metric_value REAL, metric_json TEXT, updated_at TIMESTAMP,
            UNIQUE(category, metric_name)
        )
    """)
    c.execute("""
        INSERT INTO baseline_stats (category, metric_name, metric_value)
        VALUES ('food', 'avg_title_length', 15.5)
    """)
    c.execute("""
        INSERT INTO baseline_stats (category, metric_name, metric_value)
        VALUES ('food', 'avg_tag_count', 5.2)
    """)
    conn.commit()
    conn.close()
    return path


def test_get_category_stats():
    """baseline 统计查询应返回正确结构"""
    db = _create_test_db()
    try:
        comp = BaselineComparator(db_path=db)
        stats = comp.get_category_stats("food")
        assert stats["category"] == "food"
        assert "stats" in stats
        assert stats["stats"]["avg_title_length"] == 15.5
    finally:
        os.unlink(db)


def test_compare_returns_comparisons():
    """compare 应返回包含 comparisons 键的字典"""
    db = _create_test_db()
    try:
        comp = BaselineComparator(db_path=db)
        result = comp.compare("food", {
            "title_length": 10,
            "tag_count": 3,
            "tags": ["美食"],
        })
        assert "comparisons" in result
        assert "title_length" in result["comparisons"]
        assert result["comparisons"]["title_length"]["user_value"] == 10
    finally:
        os.unlink(db)


def test_compare_unknown_category():
    """查询不存在的垂类应返回空 stats"""
    db = _create_test_db()
    try:
        comp = BaselineComparator(db_path=db)
        result = comp.compare("unknown", {"title_length": 10, "tag_count": 0, "tags": []})
        assert result["category"] == "unknown"
    finally:
        os.unlink(db)
