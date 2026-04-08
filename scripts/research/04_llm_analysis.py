"""
Step 4: LLM 深度分析 (Track B)
封面视觉分析（omni）+ 内容模式总结（pro）+ 标签策略分析（pro）

Usage:
    python scripts/research/04_llm_analysis.py [--covers] [--content] [--tags] [--all]

依赖:
    pip install openai httpx
"""
from __future__ import annotations

import sqlite3
import json
import asyncio
import argparse
import base64
import sys
from pathlib import Path

import httpx
from openai import AsyncOpenAI

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    RESEARCH_DB, COVERS_DIR, LLM_DIR,
    API_KEY, API_BASE, MODEL_OMNI, MODEL_PRO, MODEL_FAST,
    OMNI_CONCURRENCY, ALL_CATEGORIES,
)


def get_client() -> AsyncOpenAI:
    http_client = httpx.AsyncClient(proxy=None, trust_env=False, timeout=httpx.Timeout(120.0, connect=30.0))
    return AsyncOpenAI(api_key=API_KEY, base_url=API_BASE, http_client=http_client)


# ─── 4.1 封面视觉分析 ───

COVER_PROMPT = """你是一个小红书封面视觉分析专家。请分析这张小红书笔记封面图片，输出 JSON 格式：

{
  "cover_style": "人物出镜/产品特写/场景图/拼图/纯文字/对比图/风景",
  "color_tone": "暖色调/冷色调/中性/高饱和/低饱和",
  "text_overlay": true或false,
  "text_content": "封面上的文字内容，无文字则为空字符串",
  "text_area_ratio": 0.0到1.0的数字,
  "has_face": true或false,
  "face_expression": "微笑/严肃/夸张/无",
  "composition": "居中/三分法/对角线/留白/满铺",
  "visual_quality": 1到10的整数,
  "click_appeal": 1到10的整数,
  "style_tags": ["标签1", "标签2"]
}

只输出 JSON，不要其他内容。"""


async def analyze_cover(client: AsyncOpenAI, note_id: str, image_path: Path, semaphore: asyncio.Semaphore) -> dict | None:
    """用 omni 模型分析单张封面"""
    async with semaphore:
        try:
            img_data = image_path.read_bytes()
            b64 = base64.b64encode(img_data).decode()

            # 检测图片类型
            suffix = image_path.suffix.lower()
            mime = "image/webp" if suffix == ".webp" else "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"

            response = await client.chat.completions.create(
                model=MODEL_OMNI,
                messages=[
                    {"role": "system", "content": COVER_PROMPT},
                    {"role": "user", "content": [
                        {"type": "text", "text": "请分析这张小红书笔记封面"},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ]},
                ],
                max_tokens=500,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            result = json.loads(raw)
            result["note_id"] = note_id
            return result
        except Exception as e:
            print(f"  封面分析失败 {note_id}: {e}")
            return None


async def run_cover_analysis():
    """批量分析封面"""
    print("\n=== 4.1 封面视觉分析 (mimo-v2-omni) ===")

    conn = sqlite3.connect(RESEARCH_DB)
    cursor = conn.cursor()
    client = get_client()
    semaphore = asyncio.Semaphore(OMNI_CONCURRENCY)

    all_results = {}
    for cat in ALL_CATEGORIES:
        cat_dir = COVERS_DIR / cat
        if not cat_dir.exists():
            continue

        cursor.execute(
            "SELECT note_id FROM research_notes WHERE category=? AND cover_analysis IS NULL",
            (cat,)
        )
        note_ids = {r[0] for r in cursor.fetchall()}

        # 找到已下载的封面
        tasks = []
        for img_path in cat_dir.iterdir():
            nid = img_path.stem
            if nid in note_ids:
                tasks.append((nid, img_path))

        if not tasks:
            continue

        print(f"  [{cat}] 分析 {len(tasks)} 张封面...")

        batch_size = 20
        cat_results = []
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i+batch_size]
            coros = [analyze_cover(client, nid, p, semaphore) for nid, p in batch]
            results = await asyncio.gather(*coros)
            for r in results:
                if r:
                    cat_results.append(r)
                    # 更新数据库
                    cursor.execute(
                        "UPDATE research_notes SET cover_analysis=? WHERE note_id=?",
                        (json.dumps(r, ensure_ascii=False), r["note_id"])
                    )
            conn.commit()
            print(f"    批次 {i//batch_size + 1}/{(len(tasks)-1)//batch_size + 1}: {sum(1 for r in results if r)}/{len(batch)} 成功")

        all_results[cat] = cat_results

    # 保存汇总
    out = LLM_DIR / "cover_analysis_all.json"
    out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2))
    print(f"  → {out}")

    conn.close()
    await client.close()
    return all_results


# ─── 4.2 内容模式分析 ───

CONTENT_PATTERN_PROMPT = """你是小红书内容研究专家。以下是 {category} 品类中的爆款笔记数据（标题和正文摘要）。

请分析并总结，输出 JSON：

{{
  "title_patterns": [
    {{"pattern_name": "模式名称", "template": "模板句式", "examples": ["示例1", "示例2"], "frequency": "高/中/低"}}
  ],
  "content_structure": [
    {{"type": "结构类型", "description": "描述", "typical_flow": ["段落1", "段落2", "..."]}}
  ],
  "high_frequency_words": ["词1", "词2", ...],
  "emotion_tone": "品类主流情绪基调",
  "info_density": "高密度干货/中等/轻松随意",
  "viral_vs_normal_diff": ["差异点1", "差异点2", ...],
  "key_findings": ["发现1", "发现2", ...]
}}

笔记数据：
{notes_json}"""


async def run_content_analysis():
    """每品类的内容模式分析"""
    print("\n=== 4.2 内容模式分析 (mimo-v2-pro) ===")

    conn = sqlite3.connect(RESEARCH_DB)
    cursor = conn.cursor()
    client = get_client()

    results = {}
    for cat in ALL_CATEGORIES:
        # 取爆款 + 部分普通笔记
        cursor.execute("""
            SELECT title, SUBSTR(content, 1, 200) as excerpt, engagement, is_viral
            FROM research_notes WHERE category=? AND title != ''
            ORDER BY engagement DESC LIMIT 80
        """, (cat,))
        rows = cursor.fetchall()
        if not rows:
            continue

        notes_data = [
            {"title": r[0], "excerpt": r[1], "engagement": r[2], "is_viral": bool(r[3])}
            for r in rows
        ]

        prompt = CONTENT_PATTERN_PROMPT.format(
            category=cat,
            notes_json=json.dumps(notes_data, ensure_ascii=False, indent=1)
        )

        print(f"  [{cat}] 分析 {len(rows)} 条笔记内容模式...")
        try:
            response = await client.chat.completions.create(
                model=MODEL_PRO,
                messages=[
                    {"role": "system", "content": "你是数据分析专家，只输出 JSON。"},
                    {"role": "user", "content": prompt},
                ],
                max_completion_tokens=3000,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            result = json.loads(raw)
            results[cat] = result
            print(f"    发现 {len(result.get('title_patterns', []))} 种标题模式")
        except Exception as e:
            print(f"    失败: {e}")

    out = LLM_DIR / "content_patterns.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"  → {out}")

    conn.close()
    await client.close()
    return results


# ─── 4.3 标签策略分析 ───

TAG_ANALYSIS_PROMPT = """分析以下 {category} 品类笔记的标签使用策略。数据包含每条笔记的标签列表和互动数据。

请输出 JSON：
{{
  "top_tags": [{{"tag": "标签", "count": 数量, "avg_engagement": 平均互动}}],
  "hidden_gems": [{{"tag": "长尾标签", "avg_engagement": 平均互动, "note_count": 使用数量}}],
  "best_combinations": [{{"tags": ["标签1", "标签2", "标签3"], "avg_engagement": 平均互动}}],
  "optimal_tag_count": {{"min": 最少, "max": 最多, "best": 最佳}},
  "strategy_advice": ["建议1", "建议2", ...]
}}

数据：
{data_json}"""


async def run_tag_analysis():
    """标签策略分析"""
    print("\n=== 4.3 标签策略分析 (mimo-v2-pro) ===")

    conn = sqlite3.connect(RESEARCH_DB)
    cursor = conn.cursor()
    client = get_client()

    results = {}
    for cat in ALL_CATEGORIES:
        cursor.execute("""
            SELECT tags, engagement, is_viral
            FROM research_notes WHERE category=? AND tags IS NOT NULL
        """, (cat,))
        rows = cursor.fetchall()
        if not rows:
            continue

        data = [
            {"tags": json.loads(r[0]) if r[0] else [], "engagement": r[1], "is_viral": bool(r[2])}
            for r in rows
        ]

        prompt = TAG_ANALYSIS_PROMPT.format(
            category=cat,
            data_json=json.dumps(data[:100], ensure_ascii=False, indent=1)  # 限制大小
        )

        print(f"  [{cat}] 分析 {len(rows)} 条笔记标签策略...")
        try:
            response = await client.chat.completions.create(
                model=MODEL_PRO,
                messages=[
                    {"role": "system", "content": "你是数据分析专家，只输出 JSON。"},
                    {"role": "user", "content": prompt},
                ],
                max_completion_tokens=2000,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            result = json.loads(raw)
            results[cat] = result
            print(f"    最佳标签数: {result.get('optimal_tag_count', {}).get('best', '?')}")
        except Exception as e:
            print(f"    失败: {e}")

    out = LLM_DIR / "tag_analysis.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"  → {out}")

    conn.close()
    await client.close()
    return results


# ─── Main ───

async def main():
    parser = argparse.ArgumentParser(description="LLM 深度分析")
    parser.add_argument("--covers", action="store_true", help="运行封面视觉分析")
    parser.add_argument("--content", action="store_true", help="运行内容模式分析")
    parser.add_argument("--tags", action="store_true", help="运行标签策略分析")
    parser.add_argument("--all", action="store_true", help="运行全部分析")
    args = parser.parse_args()

    if not any([args.covers, args.content, args.tags, args.all]):
        args.all = True

    print("=" * 60)
    print("Step 4: LLM 深度分析 (Track B)")
    print("=" * 60)

    if args.covers or args.all:
        await run_cover_analysis()
    if args.content or args.all:
        await run_content_analysis()
    if args.tags or args.all:
        await run_tag_analysis()

    print("\n" + "=" * 60)
    print(f"Track B 完成! 结果保存在: {LLM_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
