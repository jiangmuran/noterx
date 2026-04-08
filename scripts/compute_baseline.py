"""
基于 notes 表数据，预计算各垂类的 baseline 统计指标并写入 baseline_stats 表。

Usage:
    python scripts/compute_baseline.py
"""
import sqlite3
import json
import os
from collections import Counter

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "baseline.db")


def upsert_stat(cursor, category, metric_name, metric_value=None, metric_json=None):
    """插入或更新一条统计指标"""
    cursor.execute("""
        INSERT INTO baseline_stats (category, metric_name, metric_value, metric_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(category, metric_name)
        DO UPDATE SET metric_value=excluded.metric_value,
                      metric_json=excluded.metric_json,
                      updated_at=CURRENT_TIMESTAMP
    """, (category, metric_name, metric_value, metric_json))


def compute_for_category(cursor, category):
    """计算指定垂类的所有 baseline 指标"""

    # --- 标题统计 ---
    cursor.execute(
        "SELECT AVG(title_length) FROM notes WHERE category=?", (category,)
    )
    avg_title_len = cursor.fetchone()[0] or 0
    upsert_stat(cursor, category, "avg_title_length", round(avg_title_len, 1))

    cursor.execute(
        "SELECT AVG(title_length) FROM notes WHERE category=? AND is_viral=1",
        (category,),
    )
    viral_avg_title_len = cursor.fetchone()[0] or 0
    upsert_stat(cursor, category, "viral_avg_title_length", round(viral_avg_title_len, 1))

    # --- 标签统计 ---
    cursor.execute("SELECT tags FROM notes WHERE category=?", (category,))
    tag_counter = Counter()
    tag_counts = []
    for (tags_json,) in cursor.fetchall():
        try:
            t = json.loads(tags_json)
            tag_counter.update(t)
            tag_counts.append(len(t))
        except (json.JSONDecodeError, TypeError):
            pass

    avg_tag_count = sum(tag_counts) / len(tag_counts) if tag_counts else 0
    upsert_stat(cursor, category, "avg_tag_count", round(avg_tag_count, 1))

    top_tags = [{"tag": t, "count": c} for t, c in tag_counter.most_common(20)]
    upsert_stat(cursor, category, "top_tags", metric_json=json.dumps(top_tags, ensure_ascii=False))

    # --- 互动数据 ---
    for metric in ["likes", "collects", "comments"]:
        cursor.execute(
            f"SELECT AVG({metric}), MAX({metric}) FROM notes WHERE category=?",
            (category,),
        )
        avg_val, max_val = cursor.fetchone()
        upsert_stat(cursor, category, f"avg_{metric}", round(avg_val or 0, 1))
        upsert_stat(cursor, category, f"max_{metric}", max_val or 0)

        cursor.execute(
            f"SELECT AVG({metric}) FROM notes WHERE category=? AND is_viral=1",
            (category,),
        )
        viral_avg = cursor.fetchone()[0] or 0
        upsert_stat(cursor, category, f"viral_avg_{metric}", round(viral_avg, 1))

    # --- 发布时间分布 ---
    cursor.execute("""
        SELECT publish_hour, COUNT(*) as cnt,
               AVG(likes + collects + comments) as avg_engagement
        FROM notes WHERE category=?
        GROUP BY publish_hour ORDER BY publish_hour
    """, (category,))
    hour_dist = [
        {"hour": h, "count": c, "avg_engagement": round(e, 1)}
        for h, c, e in cursor.fetchall()
    ]
    upsert_stat(cursor, category, "hour_distribution",
                metric_json=json.dumps(hour_dist, ensure_ascii=False))

    # --- 封面统计 ---
    cursor.execute(
        "SELECT AVG(cover_has_face), AVG(cover_text_ratio), AVG(cover_saturation) "
        "FROM notes WHERE category=?",
        (category,),
    )
    face_rate, text_ratio, saturation = cursor.fetchone()
    upsert_stat(cursor, category, "cover_face_rate", round((face_rate or 0) * 100, 1))
    upsert_stat(cursor, category, "cover_avg_text_ratio", round(text_ratio or 0, 3))
    upsert_stat(cursor, category, "cover_avg_saturation", round(saturation or 0, 3))

    cursor.execute(
        "SELECT AVG(cover_has_face), AVG(cover_text_ratio), AVG(cover_saturation) "
        "FROM notes WHERE category=? AND is_viral=1",
        (category,),
    )
    vf, vt, vs = cursor.fetchone()
    upsert_stat(cursor, category, "viral_cover_face_rate", round((vf or 0) * 100, 1))
    upsert_stat(cursor, category, "viral_cover_avg_text_ratio", round(vt or 0, 3))
    upsert_stat(cursor, category, "viral_cover_avg_saturation", round(vs or 0, 3))

    # --- 爆款率 ---
    cursor.execute(
        "SELECT COUNT(*) FROM notes WHERE category=? AND is_viral=1", (category,)
    )
    viral_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM notes WHERE category=?", (category,))
    total_count = cursor.fetchone()[0]
    viral_rate = (viral_count / total_count * 100) if total_count else 0
    upsert_stat(cursor, category, "viral_rate", round(viral_rate, 1))

    # --- 粉丝分层统计 ---
    fan_buckets = [
        ("nano", 0, 1000),
        ("micro", 1000, 10000),
        ("mid", 10000, 100000),
        ("macro", 100000, 10**9),
    ]
    fan_stats = []
    for label, lo, hi in fan_buckets:
        cursor.execute("""
            SELECT COUNT(*), AVG(likes + collects + comments),
                   AVG(CASE WHEN is_viral=1 THEN 1.0 ELSE 0.0 END)
            FROM notes WHERE category=? AND followers >= ? AND followers < ?
        """, (category, lo, hi))
        cnt, avg_eng, vr = cursor.fetchone()
        fan_stats.append({
            "bucket": label,
            "range": f"{lo}-{hi}",
            "count": cnt or 0,
            "avg_engagement": round(avg_eng or 0, 1),
            "viral_rate": round((vr or 0) * 100, 1),
        })
    upsert_stat(cursor, category, "fan_bucket_stats",
                metric_json=json.dumps(fan_stats, ensure_ascii=False))

    # --- 标签数量分桶 vs 互动率 ---
    cursor.execute("""
        SELECT tags, likes + collects + comments as eng
        FROM notes WHERE category=?
    """, (category,))
    tag_buckets: dict[str, list[float]] = {}
    for (tags_json, eng) in cursor.fetchall():
        try:
            n = len(json.loads(tags_json))
        except (json.JSONDecodeError, TypeError):
            n = 0
        bucket = f"{n}" if n <= 8 else "9+"
        tag_buckets.setdefault(bucket, []).append(eng)

    tag_bucket_stats = []
    for bucket in sorted(tag_buckets.keys(), key=lambda x: int(x.replace("+", ""))):
        vals = tag_buckets[bucket]
        tag_bucket_stats.append({
            "tag_count": bucket,
            "note_count": len(vals),
            "avg_engagement": round(sum(vals) / len(vals), 1) if vals else 0,
        })
    upsert_stat(cursor, category, "tag_count_vs_engagement",
                metric_json=json.dumps(tag_bucket_stats, ensure_ascii=False))

    print(f"  [{category}] 已计算 baseline 指标（含粉丝分层与标签分桶）")


def main():
    """计算所有垂类的 baseline 统计指标"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM baseline_stats")

    for cat in ["food", "fashion", "tech", "travel", "beauty", "fitness", "lifestyle", "home"]:
        compute_for_category(cursor, cat)

    conn.commit()
    conn.close()
    print("所有 baseline 统计指标已计算完毕")


if __name__ == "__main__":
    main()
