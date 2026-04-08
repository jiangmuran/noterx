"""
Step 1: 数据导入与清洗
从 data/帖子数据_待处理/ 读取所有 xlsx/csv 文件，统一格式后写入 research.db

Usage:
    python scripts/research/01_import_data.py
"""
from __future__ import annotations

import sqlite3
import json
import re
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

import openpyxl

sys.path.insert(0, str(Path(__file__).parent))
from config import RAW_DATA_DIR, RESEARCH_DB, FILE_CATEGORY_MAP, ALL_CATEGORIES


def create_tables(cursor):
    """创建研究数据表"""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_notes (
            note_id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            note_type TEXT,              -- image / video
            title TEXT,
            content TEXT,
            tags TEXT,                   -- JSON array
            tag_count INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            collects INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            engagement INTEGER DEFAULT 0,
            publish_time TEXT,
            publish_hour INTEGER,
            publish_weekday INTEGER,
            author_name TEXT,
            author_total_likes INTEGER DEFAULT 0,
            author_tier TEXT,            -- nano/micro/mid/macro
            image_count INTEGER DEFAULT 0,
            cover_url TEXT,
            video_duration TEXT,
            ip_location TEXT,
            -- 衍生特征
            title_length INTEGER DEFAULT 0,
            content_length INTEGER DEFAULT 0,
            has_emoji INTEGER DEFAULT 0,
            has_numbers INTEGER DEFAULT 0,
            title_hook_count INTEGER DEFAULT 0,
            is_viral INTEGER DEFAULT 0,
            -- LLM 分析结果（后续填充）
            cover_analysis TEXT,         -- JSON from omni model
            content_analysis TEXT,       -- JSON from pro model
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rn_category ON research_notes(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rn_viral ON research_notes(is_viral)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rn_engagement ON research_notes(engagement)")


def detect_category(filename: str) -> str | None:
    """从文件名推断品类"""
    name = Path(filename).stem
    for prefix, cat in FILE_CATEGORY_MAP.items():
        if prefix in name:
            return cat
    return None


def parse_tags(raw_topics: str | None) -> list[str]:
    """解析话题字符串为标签列表"""
    if not raw_topics:
        return []
    # 去掉 [话题] 标记
    cleaned = re.sub(r'\[话题\]', '', str(raw_topics))
    # 按中文顿号或逗号分割
    tags = re.split(r'[、，,\n]', cleaned)
    return [t.strip().strip('#') for t in tags if t.strip().strip('#')]


def detect_emoji(text: str) -> bool:
    """检测文本中是否含有 emoji"""
    emoji_pattern = re.compile(
        "[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
        "\U0001F900-\U0001F9FF\U00002702-\U000027B0✨🔥💚🧋🍱‼️⭐📸📊👍👎]",
        flags=re.UNICODE
    )
    return bool(emoji_pattern.search(text or ""))


def count_hooks(title: str) -> int:
    """计算标题中的钩子元素数量"""
    hooks = 0
    if re.search(r'\d+', title):
        hooks += 1
    if re.search(r'[！!？?]', title):
        hooks += 1
    if re.search(r'[｜|]', title):
        hooks += 1
    if re.search(r'[✨🔥‼️⭐💯]', title):
        hooks += 1
    if re.search(r'(必|绝了|太|超|巨|神仙|宝藏|救命)', title):
        hooks += 1
    return hooks


def classify_author_tier(total_likes: int) -> str:
    """粉丝影响力分层"""
    if total_likes < 5000:
        return "nano"
    elif total_likes < 50000:
        return "micro"
    elif total_likes < 500000:
        return "mid"
    else:
        return "macro"


def parse_note_type(raw: str | None) -> str:
    """标准化笔记类型"""
    if not raw:
        return "image"
    r = str(raw).strip()
    if "视频" in r or "video" in r.lower():
        return "video"
    return "image"


def parse_datetime(val) -> tuple[str | None, int | None, int | None]:
    """解析时间，返回 (iso_str, hour, weekday)"""
    if val is None:
        return None, None, None
    if isinstance(val, datetime):
        return val.isoformat(), val.hour, val.weekday()
    try:
        dt = datetime.fromisoformat(str(val))
        return dt.isoformat(), dt.hour, dt.weekday()
    except (ValueError, TypeError):
        return str(val), None, None


def process_xlsx(filepath: str, category: str) -> list[dict]:
    """处理单个 xlsx 文件，返回标准化记录列表"""
    wb = openpyxl.load_workbook(filepath, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if len(rows) < 2:
        return []

    headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(rows[0])]
    records = []

    for row in rows[1:]:
        data = dict(zip(headers, row))

        note_id = str(data.get("笔记ID", "")).strip()
        if not note_id:
            continue

        title = str(data.get("笔记标题", "") or "").strip()
        content = str(data.get("笔记内容", "") or "").strip()
        tags = parse_tags(data.get("笔记话题"))
        likes = int(data.get("点赞量") or 0)
        collects = int(data.get("收藏量") or 0)
        comments_count = int(data.get("评论量") or 0)
        shares = int(data.get("分享量") or 0)
        engagement = likes + collects + comments_count + shares
        author_total = int(data.get("获赞与收藏") or 0)
        image_count = int(data.get("图片数量") or 0) if data.get("图片数量") else 0
        publish_time, publish_hour, publish_weekday = parse_datetime(data.get("发布时间"))

        records.append({
            "note_id": note_id,
            "category": category,
            "note_type": parse_note_type(data.get("笔记类型")),
            "title": title,
            "content": content,
            "tags": json.dumps(tags, ensure_ascii=False),
            "tag_count": len(tags),
            "likes": likes,
            "collects": collects,
            "comments_count": comments_count,
            "shares": shares,
            "engagement": engagement,
            "publish_time": publish_time,
            "publish_hour": publish_hour,
            "publish_weekday": publish_weekday,
            "author_name": str(data.get("博主昵称", "") or "").strip(),
            "author_total_likes": author_total,
            "author_tier": classify_author_tier(author_total),
            "image_count": image_count,
            "cover_url": str(data.get("笔记封面链接", "") or "").strip(),
            "video_duration": str(data.get("笔记视频时长", "") or "").strip() or None,
            "ip_location": str(data.get("IP地址", "") or "").strip() or None,
            "title_length": len(title),
            "content_length": len(content),
            "has_emoji": 1 if detect_emoji(title + content) else 0,
            "has_numbers": 1 if re.search(r'\d+', title) else 0,
            "title_hook_count": count_hooks(title),
        })

    return records


def compute_viral_threshold(cursor):
    """计算各品类的爆款阈值（P90 engagement）并标记 is_viral"""
    for cat in ALL_CATEGORIES:
        cursor.execute(
            "SELECT engagement FROM research_notes WHERE category=? ORDER BY engagement",
            (cat,)
        )
        vals = [r[0] for r in cursor.fetchall()]
        if not vals:
            continue
        p90_idx = int(len(vals) * 0.9)
        threshold = vals[min(p90_idx, len(vals) - 1)]
        cursor.execute(
            "UPDATE research_notes SET is_viral=1 WHERE category=? AND engagement>=?",
            (cat, threshold)
        )
        print(f"  [{cat}] {len(vals)} 条笔记, P90={threshold}, 标记爆款 {len(vals) - p90_idx} 条")


def main():
    print("=" * 60)
    print("Step 1: 数据导入与清洗")
    print("=" * 60)

    conn = sqlite3.connect(RESEARCH_DB)
    cursor = conn.cursor()
    create_tables(cursor)

    # 扫描所有 xlsx 文件
    total_imported = 0
    total_skipped = 0

    for f in sorted(RAW_DATA_DIR.iterdir()):
        if not f.suffix in (".xlsx", ".csv"):
            continue
        if f.name.startswith("."):
            continue

        category = detect_category(f.name)
        if not category:
            print(f"  [跳过] {f.name} — 无法识别品类")
            continue

        print(f"\n处理: {f.name} → {category}")
        records = process_xlsx(str(f), category)

        imported = 0
        for r in records:
            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO research_notes (
                        note_id, category, note_type, title, content, tags, tag_count,
                        likes, collects, comments_count, shares, engagement,
                        publish_time, publish_hour, publish_weekday,
                        author_name, author_total_likes, author_tier,
                        image_count, cover_url, video_duration, ip_location,
                        title_length, content_length, has_emoji, has_numbers, title_hook_count
                    ) VALUES (
                        :note_id, :category, :note_type, :title, :content, :tags, :tag_count,
                        :likes, :collects, :comments_count, :shares, :engagement,
                        :publish_time, :publish_hour, :publish_weekday,
                        :author_name, :author_total_likes, :author_tier,
                        :image_count, :cover_url, :video_duration, :ip_location,
                        :title_length, :content_length, :has_emoji, :has_numbers, :title_hook_count
                    )
                """, r)
                imported += 1
            except Exception as e:
                print(f"  错误: {r['note_id']} — {e}")
                total_skipped += 1

        total_imported += imported
        print(f"  导入 {imported} 条")

    # 计算爆款阈值
    print("\n计算爆款阈值...")
    compute_viral_threshold(cursor)

    conn.commit()

    # 输出统计报告
    print("\n" + "=" * 60)
    print("导入统计")
    print("=" * 60)
    cursor.execute("SELECT category, COUNT(*), SUM(is_viral) FROM research_notes GROUP BY category")
    for cat, total, viral in cursor.fetchall():
        print(f"  {cat:12s}: {total:4d} 条 ({viral or 0} 条爆款)")

    cursor.execute("SELECT COUNT(*) FROM research_notes")
    total = cursor.fetchone()[0]
    print(f"\n  总计: {total} 条笔记, 跳过 {total_skipped} 条")

    conn.close()
    print("\n数据已写入:", RESEARCH_DB)


if __name__ == "__main__":
    main()
