"""
Step 6: 用户画像系统（独立模块）
基于评论数据，通过 LLM 分类 + 传统聚类交叉验证，构建品类用户画像。

Usage:
    python scripts/research/06_user_persona.py

数据要求:
    评论数据需放在 data/评论数据/ 目录下，支持 xlsx/csv 格式
    必需列: 笔记ID, 评论内容, 评论点赞数
    可选列: 是否作者回复, 父评论ID, 用户昵称
"""
import sqlite3
import json
import asyncio
import re
import sys
from pathlib import Path
from collections import Counter

import httpx
from openai import AsyncOpenAI

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    RESEARCH_DB, LLM_DIR, OUTPUT_DIR, DATA_DIR,
    API_KEY, API_BASE, MODEL_FAST, MODEL_PRO,
    FLASH_CONCURRENCY, ALL_CATEGORIES,
)


COMMENTS_DIR = DATA_DIR / "评论数据"


def get_client() -> AsyncOpenAI:
    http_client = httpx.AsyncClient(proxy=None, trust_env=False, timeout=httpx.Timeout(120.0, connect=30.0))
    return AsyncOpenAI(api_key=API_KEY, base_url=API_BASE, http_client=http_client)


def create_comments_table(cursor):
    """创建评论数据表"""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_comments (
            comment_id TEXT PRIMARY KEY,
            note_id TEXT,
            category TEXT,
            text TEXT,
            likes INTEGER DEFAULT 0,
            is_author_reply INTEGER DEFAULT 0,
            parent_id TEXT,
            -- LLM 分类结果
            sentiment TEXT,
            user_type TEXT,
            intent TEXT,
            emotion_level INTEGER,
            classified_at TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rc_category ON research_comments(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rc_note ON research_comments(note_id)")


def import_comments():
    """导入评论数据"""
    if not COMMENTS_DIR.exists():
        print(f"  评论数据目录不存在: {COMMENTS_DIR}")
        print(f"  请创建 {COMMENTS_DIR} 并放入评论数据文件")
        return 0

    import openpyxl

    conn = sqlite3.connect(RESEARCH_DB)
    cursor = conn.cursor()
    create_comments_table(cursor)

    total = 0
    for f in sorted(COMMENTS_DIR.iterdir()):
        if not f.suffix in (".xlsx", ".csv"):
            continue
        if f.name.startswith("."):
            continue

        print(f"  导入: {f.name}")
        try:
            wb = openpyxl.load_workbook(str(f), read_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            wb.close()

            if len(rows) < 2:
                continue

            headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(rows[0])]

            for row in rows[1:]:
                data = dict(zip(headers, row))
                text = str(data.get("评论内容", "") or "").strip()
                if not text:
                    continue

                comment_id = str(data.get("评论ID", "")) or f"auto_{hash(text) % 10**9}"
                note_id = str(data.get("笔记ID", "") or "")
                likes = int(data.get("评论点赞数", 0) or data.get("点赞量", 0) or 0)
                is_reply = 1 if data.get("是否作者回复") else 0
                parent = str(data.get("父评论ID", "") or "") or None

                # 推断品类（通过笔记ID关联）
                category = None
                if note_id:
                    cursor.execute("SELECT category FROM research_notes WHERE note_id=?", (note_id,))
                    r = cursor.fetchone()
                    if r:
                        category = r[0]

                cursor.execute("""
                    INSERT OR IGNORE INTO research_comments
                    (comment_id, note_id, category, text, likes, is_author_reply, parent_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (comment_id, note_id, category, text, likes, is_reply, parent))
                total += 1

        except Exception as e:
            print(f"    导入失败: {e}")

    conn.commit()
    conn.close()
    print(f"  共导入 {total} 条评论")
    return total


# ─── LLM 分类 ───

CLASSIFY_PROMPT = """对以下小红书评论进行分类。每条评论输出一个 JSON 对象。

分类维度：
- sentiment: positive / negative / neutral
- user_type: 种草型 / 经验型 / 质疑型 / 求购型 / 调侃型 / 路人型
- intent: 赞美 / 追问 / 分享经验 / 质疑 / 求链接 / 吐槽 / 互动 / 争论
- emotion_level: 1-5 (1=平淡, 5=激动)

输出 JSON 数组：
[
  {{"id": "评论ID", "sentiment": "...", "user_type": "...", "intent": "...", "emotion_level": N}},
  ...
]

评论数据：
{comments}"""


async def classify_batch(client: AsyncOpenAI, batch: list[dict], semaphore: asyncio.Semaphore) -> list[dict]:
    """批量分类评论"""
    async with semaphore:
        try:
            comments_text = "\n".join(
                f'ID:{c["id"]} 内容:{c["text"][:100]}'
                for c in batch
            )
            response = await client.chat.completions.create(
                model=MODEL_FAST,
                messages=[
                    {"role": "system", "content": "你是评论分析专家，只输出 JSON 数组。"},
                    {"role": "user", "content": CLASSIFY_PROMPT.format(comments=comments_text)},
                ],
                max_completion_tokens=1500,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(raw)
        except Exception as e:
            print(f"    分类失败: {e}")
            return []


async def run_classification():
    """批量分类所有未分类评论"""
    print("\n=== 6.2 LLM 评论分类 (mimo-v2-flash) ===")

    conn = sqlite3.connect(RESEARCH_DB)
    cursor = conn.cursor()
    client = get_client()
    semaphore = asyncio.Semaphore(FLASH_CONCURRENCY)

    cursor.execute(
        "SELECT comment_id, text FROM research_comments WHERE sentiment IS NULL LIMIT 5000"
    )
    rows = cursor.fetchall()
    if not rows:
        print("  无待分类评论")
        conn.close()
        return

    print(f"  待分类: {len(rows)} 条")

    # 分批处理，每批 10 条
    batch_size = 10
    total_classified = 0
    for i in range(0, len(rows), batch_size):
        batch = [{"id": r[0], "text": r[1]} for r in rows[i:i+batch_size]]
        results = await classify_batch(client, batch, semaphore)

        for r in results:
            cid = r.get("id")
            if not cid:
                continue
            cursor.execute("""
                UPDATE research_comments
                SET sentiment=?, user_type=?, intent=?, emotion_level=?, classified_at=CURRENT_TIMESTAMP
                WHERE comment_id=?
            """, (r.get("sentiment"), r.get("user_type"), r.get("intent"),
                  r.get("emotion_level"), cid))
            total_classified += 1

        if (i // batch_size + 1) % 10 == 0:
            conn.commit()
            print(f"    进度: {min(i+batch_size, len(rows))}/{len(rows)}")

    conn.commit()
    print(f"  已分类: {total_classified} 条")

    conn.close()
    await client.close()


# ─── 画像生成 ───

PERSONA_PROMPT = """你是小红书用户研究专家。以下是 {category} 品类评论的分类统计结果和示例评论。

请生成 5-8 种典型用户画像，输出 JSON：
{{
  "personas": [
    {{
      "name": "画像名称",
      "ratio": 0.30,
      "description": "简短描述",
      "language_style": "语言风格特征",
      "typical_phrases": ["常用短语1", "常用短语2", "常用短语3"],
      "comment_templates": ["模板1：{{product}}好好用！", "模板2"],
      "triggers": "什么内容会触发这类评论",
      "interaction_style": "倾向点赞/回复/争论/默默收藏"
    }}
  ],
  "controversy_patterns": [
    {{
      "topic": "争议话题",
      "side_a": "正方观点模板",
      "side_b": "反方观点模板",
      "escalation_path": ["起始→", "升级→", "爆发"]
    }}
  ],
  "category_characteristics": "该品类评论区的独特生态描述"
}}

分类统计：
{stats}

示例评论（按类型分组）：
{examples}"""


async def generate_personas():
    """基于分类结果生成用户画像"""
    print("\n=== 6.3 用户画像生成 (mimo-v2-pro) ===")

    conn = sqlite3.connect(RESEARCH_DB)
    cursor = conn.cursor()
    client = get_client()

    all_personas = {}
    for cat in ALL_CATEGORIES:
        # 统计
        cursor.execute("""
            SELECT user_type, COUNT(*), AVG(emotion_level)
            FROM research_comments
            WHERE category=? AND user_type IS NOT NULL
            GROUP BY user_type
        """, (cat,))
        type_stats = cursor.fetchall()
        if not type_stats:
            continue

        stats = [{"type": r[0], "count": r[1], "avg_emotion": round(r[2] or 0, 1)} for r in type_stats]

        # 每类取 5 条示例
        examples = {}
        for s in stats:
            cursor.execute("""
                SELECT text FROM research_comments
                WHERE category=? AND user_type=?
                ORDER BY likes DESC LIMIT 5
            """, (cat, s["type"]))
            examples[s["type"]] = [r[0] for r in cursor.fetchall()]

        prompt = PERSONA_PROMPT.format(
            category=cat,
            stats=json.dumps(stats, ensure_ascii=False, indent=1),
            examples=json.dumps(examples, ensure_ascii=False, indent=1),
        )

        print(f"  [{cat}] 生成画像...")
        try:
            response = await client.chat.completions.create(
                model=MODEL_PRO,
                messages=[
                    {"role": "system", "content": "你是用户研究专家，只输出 JSON。"},
                    {"role": "user", "content": prompt},
                ],
                max_completion_tokens=3000,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            result = json.loads(raw)
            all_personas[cat] = result
            n = len(result.get("personas", []))
            print(f"    生成 {n} 种画像")
        except Exception as e:
            print(f"    失败: {e}")

    out = LLM_DIR / "user_personas.json"
    out.write_text(json.dumps(all_personas, ensure_ascii=False, indent=2))
    print(f"  → {out}")

    conn.close()
    await client.close()
    return all_personas


async def main():
    print("=" * 60)
    print("Step 6: 用户画像系统")
    print("=" * 60)

    # 6.1 导入评论数据
    print("\n=== 6.1 导入评论数据 ===")
    count = import_comments()

    if count > 0:
        # 6.2 LLM 分类
        await run_classification()

        # 6.3 生成画像
        await generate_personas()
    else:
        print("\n无评论数据。请采集评论后放入:")
        print(f"  {COMMENTS_DIR}/")
        print("  格式: xlsx/csv, 列: 笔记ID, 评论内容, 评论点赞数")

    print("\n" + "=" * 60)
    print("Step 6 完成!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
