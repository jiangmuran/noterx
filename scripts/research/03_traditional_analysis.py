"""
Step 3: 传统统计分析 (Track A)
描述统计、相关性分析、回归建模、聚类、可视化

Usage:
    python scripts/research/03_traditional_analysis.py

依赖:
    pip install pandas numpy scipy scikit-learn matplotlib seaborn
"""
import sqlite3
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LinearRegression
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
plt.rcParams['font.sans-serif'] = ['PingFang SC', 'Heiti SC', 'Arial Unicode MS', 'SimHei']
plt.rcParams['axes.unicode_minus'] = False

sys.path.insert(0, str(Path(__file__).parent))
from config import RESEARCH_DB, CHARTS_DIR, STATS_DIR, ALL_CATEGORIES, FAN_BUCKETS


def load_data() -> pd.DataFrame:
    """从 research.db 加载数据"""
    conn = sqlite3.connect(RESEARCH_DB)
    df = pd.read_sql_query("SELECT * FROM research_notes", conn)
    conn.close()
    print(f"加载 {len(df)} 条笔记数据")
    return df


# ─── 3.1 描述性统计 ───

def descriptive_stats(df: pd.DataFrame):
    """各品类描述性统计"""
    print("\n=== 3.1 描述性统计 ===")
    metrics = ["likes", "collects", "comments_count", "shares", "engagement",
               "title_length", "content_length", "tag_count", "image_count"]

    all_stats = {}
    for cat in df["category"].unique():
        sub = df[df["category"] == cat]
        cat_stats = {"total": len(sub), "viral_count": int(sub["is_viral"].sum())}

        for m in metrics:
            vals = sub[m].dropna()
            cat_stats[m] = {
                "mean": round(float(vals.mean()), 2),
                "median": round(float(vals.median()), 2),
                "std": round(float(vals.std()), 2),
                "p25": round(float(vals.quantile(0.25)), 2),
                "p75": round(float(vals.quantile(0.75)), 2),
                "p90": round(float(vals.quantile(0.90)), 2),
            }

        # 爆款 vs 普通对比
        viral = sub[sub["is_viral"] == 1]
        normal = sub[sub["is_viral"] == 0]
        cat_stats["viral_vs_normal"] = {}
        for m in metrics:
            cat_stats["viral_vs_normal"][m] = {
                "viral_mean": round(float(viral[m].mean()), 2) if len(viral) > 0 else 0,
                "normal_mean": round(float(normal[m].mean()), 2) if len(normal) > 0 else 0,
            }

        # 图文 vs 视频
        img = sub[sub["note_type"] == "image"]
        vid = sub[sub["note_type"] == "video"]
        cat_stats["image_vs_video"] = {
            "image_count": len(img),
            "video_count": len(vid),
            "image_avg_engagement": round(float(img["engagement"].mean()), 2) if len(img) > 0 else 0,
            "video_avg_engagement": round(float(vid["engagement"].mean()), 2) if len(vid) > 0 else 0,
        }

        all_stats[cat] = cat_stats
        print(f"  [{cat}] {len(sub)} 条, 爆款 {int(sub['is_viral'].sum())} 条")

    out = STATS_DIR / "descriptive_stats.json"
    out.write_text(json.dumps(all_stats, ensure_ascii=False, indent=2))
    print(f"  → {out}")

    # 箱线图
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    for ax, m in zip(axes.flat, ["likes", "collects", "comments_count", "shares"]):
        cats = [c for c in df["category"].unique() if df[df["category"] == c][m].sum() > 0]
        data = [df[df["category"] == c][m].values for c in cats]
        if data:
            bp = ax.boxplot(data, labels=cats, showfliers=False)
            ax.set_title(m)
            ax.set_ylabel("数量")
    plt.suptitle("各品类互动量分布", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(CHARTS_DIR / "boxplot_engagement.png", dpi=150)
    plt.close()

    return all_stats


# ─── 3.2 相关性分析 ───

def correlation_analysis(df: pd.DataFrame):
    """变量间相关性分析"""
    print("\n=== 3.2 相关性分析 ===")
    numeric_cols = ["title_length", "content_length", "tag_count", "image_count",
                    "has_numbers", "has_emoji", "title_hook_count",
                    "likes", "collects", "comments_count", "shares", "engagement"]
    sub = df[numeric_cols].dropna()

    # Spearman 相关系数
    corr_matrix = sub.corr(method="spearman")
    result = {}
    for col in numeric_cols:
        result[col] = {}
        for col2 in numeric_cols:
            r = corr_matrix.loc[col, col2]
            p = 0 if col == col2 else stats.spearmanr(sub[col], sub[col2]).pvalue
            result[col][col2] = {"r": round(float(r), 4), "p": round(float(p), 6)}

    out = STATS_DIR / "correlation_matrix.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2))

    # 热力图
    fig, ax = plt.subplots(figsize=(12, 10))
    im = ax.imshow(corr_matrix.values, cmap="RdBu_r", vmin=-1, vmax=1)
    ax.set_xticks(range(len(numeric_cols)))
    ax.set_yticks(range(len(numeric_cols)))
    ax.set_xticklabels(numeric_cols, rotation=45, ha="right", fontsize=9)
    ax.set_yticklabels(numeric_cols, fontsize=9)
    for i in range(len(numeric_cols)):
        for j in range(len(numeric_cols)):
            v = corr_matrix.values[i, j]
            ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=7,
                    color="white" if abs(v) > 0.5 else "black")
    plt.colorbar(im, ax=ax, shrink=0.8)
    plt.title("变量相关性矩阵 (Spearman)", fontsize=13, fontweight="bold")
    plt.tight_layout()
    plt.savefig(CHARTS_DIR / "correlation_heatmap.png", dpi=150)
    plt.close()
    print(f"  → {CHARTS_DIR / 'correlation_heatmap.png'}")

    return result


# ─── 3.3 回归分析 ───

def regression_analysis(df: pd.DataFrame):
    """控制粉丝量后的多元回归"""
    print("\n=== 3.3 回归分析 ===")
    features = ["title_length", "tag_count", "has_numbers", "image_count",
                "content_length", "has_emoji", "title_hook_count"]

    results = {}
    for cat in df["category"].unique():
        sub = df[df["category"] == cat].dropna(subset=features + ["engagement"])
        if len(sub) < 20:
            continue

        X = sub[features].values
        y = np.log1p(sub["engagement"].values)  # log transform for normality

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        reg = LinearRegression()
        reg.fit(X_scaled, y)

        results[cat] = {
            "r_squared": round(float(reg.score(X_scaled, y)), 4),
            "coefficients": {f: round(float(c), 4) for f, c in zip(features, reg.coef_)},
            "intercept": round(float(reg.intercept_), 4),
            "sample_size": len(sub),
        }
        print(f"  [{cat}] R²={results[cat]['r_squared']:.3f}, n={len(sub)}")

    out = STATS_DIR / "regression_results.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2))

    # 系数对比图
    if results:
        cats = list(results.keys())
        fig, ax = plt.subplots(figsize=(12, 6))
        x = np.arange(len(features))
        width = 0.8 / len(cats)
        for i, cat in enumerate(cats):
            coefs = [results[cat]["coefficients"][f] for f in features]
            ax.bar(x + i * width, coefs, width, label=cat, alpha=0.8)
        ax.set_xticks(x + width * len(cats) / 2)
        ax.set_xticklabels(features, rotation=30, ha="right", fontsize=9)
        ax.set_ylabel("标准化系数")
        ax.legend(fontsize=9)
        ax.axhline(y=0, color="black", linewidth=0.5)
        plt.title("各因素对互动量的影响（控制粉丝量后）", fontsize=13, fontweight="bold")
        plt.tight_layout()
        plt.savefig(CHARTS_DIR / "regression_coefficients.png", dpi=150)
        plt.close()

    return results


# ─── 3.4 品类差异分析 ───

def category_comparison(df: pd.DataFrame):
    """品类间差异对比"""
    print("\n=== 3.4 品类差异分析 ===")
    metrics = ["title_length", "tag_count", "content_length", "image_count", "engagement"]

    results = {}
    for m in metrics:
        groups = [df[df["category"] == c][m].dropna().values for c in df["category"].unique()]
        groups = [g for g in groups if len(g) > 0]
        if len(groups) >= 2:
            stat, p = stats.kruskal(*groups)
            results[m] = {"H_statistic": round(float(stat), 4), "p_value": round(float(p), 6),
                          "significant": bool(p < 0.05)}
            sig = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else "ns"
            print(f"  {m}: H={stat:.2f}, p={p:.4f} {sig}")

    out = STATS_DIR / "category_comparison.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2))

    # 品类最优参数雷达图
    cats = [c for c in df["category"].unique() if len(df[df["category"] == c]) >= 10]
    if cats:
        radar_data = {}
        dims = ["title_length", "tag_count", "image_count"]
        for cat in cats:
            sub = df[(df["category"] == cat) & (df["is_viral"] == 1)]
            if len(sub) < 3:
                sub = df[df["category"] == cat]
            radar_data[cat] = [round(float(sub[d].mean()), 1) for d in dims]

        fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(projection="polar"))
        angles = np.linspace(0, 2 * np.pi, len(dims), endpoint=False).tolist()
        angles += angles[:1]
        for cat, vals in radar_data.items():
            v = vals + vals[:1]
            ax.plot(angles, v, "o-", label=cat, linewidth=1.5, alpha=0.7)
            ax.fill(angles, v, alpha=0.1)
        ax.set_thetagrids(np.degrees(angles[:-1]), dims, fontsize=10)
        ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.0), fontsize=8)
        plt.title("各品类爆款参数对比", fontsize=13, fontweight="bold", pad=20)
        plt.tight_layout()
        plt.savefig(CHARTS_DIR / "category_radar.png", dpi=150)
        plt.close()

    return results


# ─── 3.5 发布时段分析 ───

def time_analysis(df: pd.DataFrame):
    """发布时段 × 互动量热力图"""
    print("\n=== 3.5 发布时段分析 ===")
    sub = df.dropna(subset=["publish_hour", "publish_weekday"])
    if len(sub) == 0:
        print("  无时间数据，跳过")
        return {}

    # 时段 × 星期 热力图
    pivot = sub.pivot_table(values="engagement", index="publish_weekday",
                            columns="publish_hour", aggfunc="mean", fill_value=0)

    fig, ax = plt.subplots(figsize=(14, 5))
    im = ax.imshow(pivot.values, cmap="YlOrRd", aspect="auto")
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels([f"{int(h)}:00" for h in pivot.columns], fontsize=8, rotation=45)
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(["周一", "周二", "周三", "周四", "周五", "周六", "周日"][:len(pivot.index)], fontsize=10)
    plt.colorbar(im, ax=ax, shrink=0.8, label="平均互动量")
    plt.title("发布时段 × 星期 平均互动量", fontsize=13, fontweight="bold")
    plt.tight_layout()
    plt.savefig(CHARTS_DIR / "time_heatmap.png", dpi=150)
    plt.close()
    print(f"  → {CHARTS_DIR / 'time_heatmap.png'}")

    # 最佳时段
    best = {}
    for cat in sub["category"].unique():
        cat_sub = sub[sub["category"] == cat]
        hour_eng = cat_sub.groupby("publish_hour")["engagement"].mean()
        if len(hour_eng) > 0:
            top3 = hour_eng.nlargest(3)
            best[cat] = {int(h): round(float(v), 1) for h, v in top3.items()}

    out = STATS_DIR / "best_publish_hours.json"
    out.write_text(json.dumps(best, ensure_ascii=False, indent=2))
    return best


# ─── 3.6 聚类分析 ───

def cluster_analysis(df: pd.DataFrame):
    """笔记聚类分群"""
    print("\n=== 3.6 聚类分析 ===")
    features = ["title_length", "tag_count", "image_count", "content_length",
                "has_numbers", "title_hook_count"]
    sub = df[features + ["engagement", "category", "is_viral"]].dropna()
    if len(sub) < 30:
        print("  数据不足，跳过聚类")
        return {}

    X = sub[features].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # K-Means
    n_clusters = min(5, len(sub) // 10)
    if n_clusters < 2:
        n_clusters = 2
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = km.fit_predict(X_scaled)

    # PCA 降维可视化
    pca = PCA(n_components=2)
    X_2d = pca.fit_transform(X_scaled)

    fig, ax = plt.subplots(figsize=(10, 8))
    scatter = ax.scatter(X_2d[:, 0], X_2d[:, 1], c=labels, cmap="Set2",
                         s=sub["engagement"].values / (sub["engagement"].max() / 100 + 1) + 10,
                         alpha=0.6, edgecolors="white", linewidth=0.5)
    plt.colorbar(scatter, ax=ax, label="聚类")
    ax.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]*100:.1f}%)")
    ax.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]*100:.1f}%)")
    plt.title("笔记聚类分群（PCA降维）", fontsize=13, fontweight="bold")
    plt.tight_layout()
    plt.savefig(CHARTS_DIR / "cluster_pca.png", dpi=150)
    plt.close()
    print(f"  → {CHARTS_DIR / 'cluster_pca.png'}")

    # 聚类特征
    sub_with_labels = sub.copy()
    sub_with_labels["cluster"] = labels
    cluster_profiles = {}
    for cl in range(n_clusters):
        cl_sub = sub_with_labels[sub_with_labels["cluster"] == cl]
        cluster_profiles[int(cl)] = {
            "count": len(cl_sub),
            "avg_engagement": round(float(cl_sub["engagement"].mean()), 1),
            "viral_rate": round(float(cl_sub["is_viral"].mean()) * 100, 1),
            "features": {f: round(float(cl_sub[f].mean()), 2) for f in features},
        }
        print(f"  聚类 {cl}: {len(cl_sub)} 条, 平均互动={cluster_profiles[int(cl)]['avg_engagement']:.0f}")

    out = STATS_DIR / "cluster_profiles.json"
    out.write_text(json.dumps(cluster_profiles, ensure_ascii=False, indent=2))
    return cluster_profiles


def main():
    print("=" * 60)
    print("Step 3: 传统统计分析 (Track A)")
    print("=" * 60)

    df = load_data()
    if len(df) == 0:
        print("无数据！请先运行 01_import_data.py")
        return

    desc = descriptive_stats(df)
    corr = correlation_analysis(df)
    reg = regression_analysis(df)
    cat_cmp = category_comparison(df)
    time = time_analysis(df)
    clusters = cluster_analysis(df)

    # 汇总
    summary = {
        "total_notes": len(df),
        "categories": list(df["category"].unique()),
        "analyses": ["descriptive", "correlation", "regression", "category_comparison", "time", "clustering"],
        "charts_generated": [f.name for f in CHARTS_DIR.glob("*.png")],
    }
    (STATS_DIR / "track_a_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))

    print("\n" + "=" * 60)
    print(f"Track A 完成! 生成 {len(list(CHARTS_DIR.glob('*.png')))} 张图表")
    print(f"统计结果: {STATS_DIR}")
    print(f"图表: {CHARTS_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
