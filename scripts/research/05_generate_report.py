"""
Step 5: 综合报告生成
合并 Track A 统计结果 + Track B LLM 分析结果，传给 LLM 做最终解读，生成研究报告。

Usage:
    python scripts/research/05_generate_report.py
"""
import json
import asyncio
import sys
from pathlib import Path
from datetime import datetime

import httpx
from openai import AsyncOpenAI

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    STATS_DIR, LLM_DIR, OUTPUT_DIR,
    API_KEY, API_BASE, MODEL_PRO, ALL_CATEGORIES,
)


def get_client() -> AsyncOpenAI:
    http_client = httpx.AsyncClient(proxy=None, trust_env=False, timeout=httpx.Timeout(180.0, connect=30.0))
    return AsyncOpenAI(api_key=API_KEY, base_url=API_BASE, http_client=http_client)


def load_json(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {}


REPORT_PROMPT = """你是一个资深的社交媒体数据科学家。基于以下统计分析和 LLM 分析的结果，请撰写一份完整的研究报告。

## 要求
1. 不要简单复述数据，要**解读每个发现的实际意义**
2. 特别关注**反直觉的结论**
3. 每个品类给出**具体可执行的「黄金参数」推荐**
4. 对比品类间差异，找出**跨品类通用规律**和**品类特异规律**
5. 指出数据局限性

## 输出格式 (Markdown)

# 小红书笔记数据研究报告

## 一、研究概览
（样本量、品类覆盖、分析方法）

## 二、核心发现
（最重要的 5-8 个发现，每个配数据支撑）

## 三、各品类深度分析
（每个品类一个小节：特征画像 + 爆款密码 + 黄金参数）

## 四、封面视觉研究
（基于 LLM 视觉分析的发现）

## 五、内容模式研究
（标题模式 + 内容结构 + 情绪基调）

## 六、标签策略研究
（最优策略 + 品类差异）

## 七、发布时机研究
（最佳时段 + 星期效应）

## 八、量化评分标准
（每个品类的推荐参数表）

## 九、局限性与展望

---

## 输入数据

### 描述性统计
{descriptive_stats}

### 相关性分析
{correlation}

### 回归分析
{regression}

### 品类差异
{category_comparison}

### 最佳发布时段
{best_hours}

### 聚类分析
{clusters}

### 封面视觉分析（LLM）
{cover_analysis_summary}

### 内容模式分析（LLM）
{content_patterns}

### 标签策略分析（LLM）
{tag_analysis}
"""


def summarize_cover_analysis(cover_data: dict) -> dict:
    """汇总封面分析结果，避免传太多数据"""
    summary = {}
    for cat, items in cover_data.items():
        if not items:
            continue
        styles = {}
        tones = {}
        face_count = 0
        text_overlay_count = 0
        avg_quality = 0
        avg_appeal = 0

        for item in items:
            s = item.get("cover_style", "unknown")
            styles[s] = styles.get(s, 0) + 1
            t = item.get("color_tone", "unknown")
            tones[t] = tones.get(t, 0) + 1
            if item.get("has_face"):
                face_count += 1
            if item.get("text_overlay"):
                text_overlay_count += 1
            avg_quality += item.get("visual_quality", 0)
            avg_appeal += item.get("click_appeal", 0)

        n = len(items)
        summary[cat] = {
            "analyzed": n,
            "top_styles": dict(sorted(styles.items(), key=lambda x: -x[1])[:5]),
            "top_tones": dict(sorted(tones.items(), key=lambda x: -x[1])[:3]),
            "face_rate": round(face_count / n * 100, 1),
            "text_overlay_rate": round(text_overlay_count / n * 100, 1),
            "avg_visual_quality": round(avg_quality / n, 2),
            "avg_click_appeal": round(avg_appeal / n, 2),
        }
    return summary


async def main():
    print("=" * 60)
    print("Step 5: 综合报告生成")
    print("=" * 60)

    # 加载所有分析结果
    desc_stats = load_json(STATS_DIR / "descriptive_stats.json")
    correlation = load_json(STATS_DIR / "correlation_matrix.json")
    regression = load_json(STATS_DIR / "regression_results.json")
    cat_cmp = load_json(STATS_DIR / "category_comparison.json")
    best_hours = load_json(STATS_DIR / "best_publish_hours.json")
    clusters = load_json(STATS_DIR / "cluster_profiles.json")
    cover_all = load_json(LLM_DIR / "cover_analysis_all.json")
    content_patterns = load_json(LLM_DIR / "content_patterns.json")
    tag_analysis = load_json(LLM_DIR / "tag_analysis.json")

    # 汇总封面数据
    cover_summary = summarize_cover_analysis(cover_all)

    # 精简相关性数据（只保留与 engagement 的相关性）
    corr_simplified = {}
    if correlation and "engagement" in correlation:
        for k, v in correlation["engagement"].items():
            if k != "engagement":
                corr_simplified[k] = v

    prompt = REPORT_PROMPT.format(
        descriptive_stats=json.dumps(desc_stats, ensure_ascii=False, indent=1)[:3000],
        correlation=json.dumps(corr_simplified, ensure_ascii=False, indent=1),
        regression=json.dumps(regression, ensure_ascii=False, indent=1),
        category_comparison=json.dumps(cat_cmp, ensure_ascii=False, indent=1),
        best_hours=json.dumps(best_hours, ensure_ascii=False, indent=1),
        clusters=json.dumps(clusters, ensure_ascii=False, indent=1),
        cover_analysis_summary=json.dumps(cover_summary, ensure_ascii=False, indent=1),
        content_patterns=json.dumps(content_patterns, ensure_ascii=False, indent=1)[:3000],
        tag_analysis=json.dumps(tag_analysis, ensure_ascii=False, indent=1)[:2000],
    )

    print("调用 mimo-v2-pro 生成最终报告...")
    client = get_client()
    try:
        response = await client.chat.completions.create(
            model=MODEL_PRO,
            messages=[
                {"role": "system", "content": "你是数据科学研究员，擅长将数据分析转化为可读性强的研究报告。使用中文撰写。"},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=8000,
        )
        report_text = response.choices[0].message.content

        # 添加元信息
        header = f"""---
生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}
数据来源: NoteRx 研究数据库
分析方法: 传统统计 (Track A) + LLM 深度分析 (Track B)
模型: {MODEL_PRO}
---

"""
        report = header + report_text

        out = OUTPUT_DIR / "final_report.md"
        out.write_text(report)
        print(f"\n报告已生成: {out}")
        print(f"报告长度: {len(report_text)} 字")

    except Exception as e:
        print(f"报告生成失败: {e}")

    # 生成量化评分参数
    print("\n生成量化评分参数...")
    scoring_params = {}
    for cat in ALL_CATEGORIES:
        if cat not in desc_stats:
            continue
        d = desc_stats[cat]
        reg_cat = regression.get(cat, {})
        coefs = reg_cat.get("coefficients", {})

        # 从描述统计和回归系数推导最优参数
        scoring_params[cat] = {
            "scoring_params": {
                "title_length": {
                    "optimal_range": [
                        int(d.get("title_length", {}).get("p25", 10)),
                        int(d.get("title_length", {}).get("p75", 30)),
                    ],
                    "weight": round(abs(coefs.get("title_length", 0.1)), 3),
                },
                "tag_count": {
                    "optimal_range": [
                        int(d.get("tag_count", {}).get("p25", 3)),
                        int(d.get("tag_count", {}).get("p75", 8)),
                    ],
                    "weight": round(abs(coefs.get("tag_count", 0.1)), 3),
                },
                "has_numbers": {
                    "bonus": 5,
                    "weight": round(abs(coefs.get("has_numbers", 0.05)), 3),
                },
                "content_length": {
                    "optimal_range": [
                        int(d.get("content_length", {}).get("p25", 100)),
                        int(d.get("content_length", {}).get("p75", 500)),
                    ],
                    "weight": round(abs(coefs.get("content_length", 0.1)), 3),
                },
                "image_count": {
                    "optimal_range": [
                        int(d.get("image_count", {}).get("p25", 1)),
                        int(d.get("image_count", {}).get("p75", 9)),
                    ],
                    "weight": round(abs(coefs.get("image_count", 0.05)), 3),
                },
            },
            "baseline": {
                "avg_engagement": d.get("engagement", {}).get("mean", 0),
                "viral_threshold": d.get("engagement", {}).get("p90", 0),
                "viral_rate": round(d.get("viral_count", 0) / max(d.get("total", 1), 1) * 100, 1),
            },
        }

    out = OUTPUT_DIR / "scoring_params.json"
    out.write_text(json.dumps(scoring_params, ensure_ascii=False, indent=2))
    print(f"评分参数: {out}")

    await client.close()

    print("\n" + "=" * 60)
    print("Step 5 完成!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
