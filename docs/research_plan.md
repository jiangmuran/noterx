# NoteRx 数据研究方案

## 一、研究目标

建立一套**可量化、可复现、可自进化**的小红书笔记评价体系，最终产出：

1. **量化评分系统** — 基于传统统计方法，输出每个维度的数值评分标准
2. **LLM 评价标准** — 基于大语言模型的内容/视觉/策略评价流程和提示词
3. **用户画像系统** — 独立模块，基于评论数据构建品类用户画像
4. **最终研究报告** — 双轨分析结果 + 可视化 + 结论

---

## 二、双轨分析架构

```
                    ┌──────────────────────────────────┐
                    │         原始数据入库               │
                    │  xlsx/csv/json → 统一 SQLite 格式  │
                    └───────────┬──────────────────────┘
                                │
                    ┌───────────▼──────────────────────┐
                    │       数据清洗 & 特征工程           │
                    │  文本特征 / 视觉特征 / 互动指标      │
                    └───────┬───────────┬──────────────┘
                            │           │
              ┌─────────────▼──┐  ┌─────▼──────────────┐
              │  Track A:       │  │  Track B:           │
              │  传统统计分析    │  │  LLM 深度分析        │
              │                │  │                     │
              │  ▸ 描述统计     │  │  ▸ mimo-v2-omni     │
              │  ▸ 相关性分析   │  │    封面视觉理解      │
              │  ▸ 回归建模     │  │  ▸ mimo-v2-pro      │
              │  ▸ 聚类分群     │  │    内容模式总结      │
              │  ▸ 控变量对比   │  │  ▸ 标题吸引力评价    │
              │  ▸ 分布检验     │  │  ▸ 标签策略分析      │
              └───────┬────────┘  └────────┬────────────┘
                      │                    │
              ┌───────▼────────────────────▼────────────┐
              │          参数报告 & 评价标准               │
              │  量化系统输出评分参数 → 传入 LLM            │
              │  LLM 基于参数做更深入的统计解读和建议       │
              └───────────────────┬─────────────────────┘
                                  │
              ┌───────────────────▼─────────────────────┐
              │           最终研究报告                    │
              │  统计图表 + LLM 分析 + 结论 + 可视化       │
              └────────────────────────────────────────┘

              ┌────────────────────────────────────────┐
              │     独立模块：用户画像系统                 │
              │  评论数据 → LLM 分类 → 画像模板           │
              └────────────────────────────────────────┘
```

---

## 三、数据源与处理

### 3.1 现有数据

| 文件 | 品类 | 数量 | 状态 |
|------|------|------|------|
| 美食帖.xlsx | food | 100 | 已采集 |
| 穿搭帖.xlsx | fashion | 100 | 已采集 |
| 时尚帖.xlsx | fashion | 200 | 已采集（与穿搭合并） |
| 科技帖.xlsx | tech | 200 | 已采集 |
| 旅游帖.xlsx | travel | 100 | 已采集 |

### 3.2 待采集

| 品类 | 目标数量 | 搜索关键词 |
|------|---------|-----------|
| beauty 美妆 | 600-800 | 化妆教程、护肤分享、口红试色 |
| fitness 健身 | 600-800 | 居家健身、减脂打卡、健身教程 |
| lifestyle 生活 | 600-800 | 独居日常、提升自己、生活好物 |
| home 家居 | 600-800 | 家居改造、收纳整理、租房改造 |
| 各品类补充 | 各200+ | 见采集关键词表 |

### 3.3 统一字段映射

采集原始字段 → 系统内部字段：

| 原始列名 | 内部字段 | 类型 | 说明 |
|----------|---------|------|------|
| 笔记ID | note_id | TEXT | 主键，去重 |
| 笔记类型 | note_type | TEXT | "图文" → "image", "视频" → "video" |
| 笔记标题 | title | TEXT | |
| 笔记内容 | content | TEXT | |
| 笔记话题 | tags | TEXT→JSON | 顿号/逗号分割后转 JSON 数组 |
| 点赞量 | likes | INT | |
| 收藏量 | collects | INT | |
| 评论量 | comments_count | INT | |
| 分享量 | shares | INT | 新增字段 |
| 发布时间 | publish_time | DATETIME | |
| 博主昵称 | author_name | TEXT | |
| 获赞与收藏 | author_total_likes | INT | 博主总获赞，近似粉丝影响力 |
| 图片数量 | image_count | INT | |
| 笔记封面链接 | cover_url | TEXT | 用于下载做视觉分析 |
| 笔记视频时长 | video_duration | TEXT | |
| IP地址 | ip_location | TEXT | |

### 3.4 衍生特征（数据清洗阶段自动计算）

| 特征 | 计算方式 | 用途 |
|------|---------|------|
| title_length | len(title) | 标题长度分析 |
| content_length | len(content) | 正文篇幅分析 |
| tag_count | len(tags) | 标签数量分析 |
| has_emoji | regex 检测 | 表情使用率 |
| has_numbers | regex 检测 | 标题数字使用率 |
| engagement | likes + collects + comments + shares | 综合互动量 |
| engagement_rate | engagement / author_total_likes | 互动率（归一化） |
| is_viral | engagement > 品类 P90 | 是否爆款 |
| publish_hour | extract from publish_time | 发布时段 |
| publish_weekday | extract from publish_time | 发布星期 |
| title_hook_count | 检测数字/感叹号/问号/竖线 | 标题钩子数 |

---

## 四、Track A：传统统计分析

### 4.1 描述性统计（每品类）

对每个品类输出基础统计报告：

- 各指标的均值、中位数、标准差、分位数（P25/P50/P75/P90）
- 爆款笔记 vs 普通笔记的各维度对比
- 图文 vs 视频笔记的互动差异

### 4.2 相关性分析

计算以下变量间的 Pearson/Spearman 相关系数：

| 变量 A | 变量 B | 假设 |
|--------|--------|------|
| title_length | engagement | 标题越长互动越好？ |
| tag_count | engagement | 标签越多曝光越多？ |
| image_count | collects | 图片越多收藏越多？ |
| has_numbers | likes | 数字标题更吸引？ |
| content_length | comments_count | 长文更容易引发讨论？ |
| publish_hour | engagement | 发布时间影响互动？ |
| author_total_likes | engagement | 大号效应有多强？ |

输出：相关性矩阵热力图 + 显著性标注

### 4.3 控变量回归分析

使用多元线性回归 / 分位数回归，控制粉丝量级后分析各因素对互动量的独立贡献：

```
engagement ~ title_length + tag_count + has_numbers + image_count 
             + publish_hour + note_type + content_length
             + author_tier (粉丝量分桶)
```

粉丝量分桶：nano(<1K), micro(1K-10K), mid(10K-100K), macro(100K+)

### 4.4 品类间差异分析

- ANOVA / Kruskal-Wallis 检验品类间差异显著性
- 每品类的「最优参数区间」提取
- 输出：品类差异雷达图

### 4.5 聚类分析

对笔记做 K-Means / DBSCAN 聚类，发现自然分群：
- 爆款笔记的共同特征模式
- 不同创作风格的笔记群
- 异常值分析（超级爆款 vs 数据异常）

---

## 五、Track B：LLM 深度分析

### 5.1 封面视觉分析（mimo-v2-omni）

对每条笔记的封面图：
1. 下载封面图片
2. 调用 mimo-v2-omni 分析

**提示词**：

```
你是一个小红书封面视觉分析专家。请分析这张小红书笔记封面图片，输出 JSON 格式：

{
  "cover_style": "人物出镜/产品特写/场景图/拼图/纯文字/对比图",
  "color_tone": "暖色调/冷色调/中性/高饱和/低饱和",
  "text_overlay": "有/无",
  "text_content": "封面上的文字内容（如有）",
  "text_area_ratio": 0.0-1.0,
  "has_face": true/false,
  "face_expression": "微笑/严肃/夸张/无",
  "composition": "居中/三分法/对角线/留白/满铺",
  "visual_quality": 1-10,
  "click_appeal": 1-10,
  "style_tags": ["ins风", "日系", "韩系", "极简", "复古", ...]
}

只输出 JSON，不要其他内容。
```

**并行策略**：asyncio.gather 批量调用，每批 5-10 张，控制并发避免限流

### 5.2 内容模式分析（mimo-v2-pro）

对每品类的爆款笔记内容，调用 LLM 总结模式：

**提示词**：

```
你是小红书内容研究专家。以下是 {category} 品类中 {count} 条爆款笔记的标题和正文摘要。

请分析并总结：

1. **标题模式**（5-8 种常见模式，每种给出模板和示例）
   - 如：数字型「N步搞定XXX」、对比型「A vs B」、悬念型「千万别XXX」
2. **内容结构**（爆款笔记的典型段落结构）
   - 如：开头hook → 痛点共鸣 → 解决方案 → 总结call-to-action
3. **高频关键词**（品类专属的高转化词）
4. **情绪基调**（热情/专业/亲切/犀利/幽默）
5. **信息密度**（高密度干货 vs 轻松随意）

输出 JSON 格式：
{
  "title_patterns": [...],
  "content_structure": [...],
  "high_frequency_words": [...],
  "emotion_tone": "...",
  "info_density": "...",
  "key_findings": ["..."]
}

笔记数据如下：
{notes_json}
```

### 5.3 标签策略分析（mimo-v2-pro）

```
分析以下 {category} 品类笔记的标签使用策略。数据包含每条笔记的标签列表和互动数据。

请输出：
1. 热门标签 TOP 20 及其平均互动量
2. 长尾标签中互动率最高的 10 个（小众但有效）
3. 最佳标签组合模式（哪些标签经常同时出现在爆款中）
4. 标签数量与互动量的关系曲线描述
5. 品类专属的标签策略建议

{notes_with_tags_json}
```

### 5.4 LLM 综合评价（基于 Track A 输出）

Track A 的量化分析完成后，将统计报告传给 mimo-v2-pro 做深度解读：

```
你是一个数据科学家，专门研究社交媒体内容。以下是我们对 {category} 品类
{total_notes} 条小红书笔记的统计分析结果。

请基于这些数据：
1. 解读每个统计发现的实际意义（不要复述数字，要解释 why）
2. 发现数据中的反直觉结论（如果有）
3. 给出该品类的「黄金参数」推荐值（标题长度、标签数、发布时间等）
4. 指出数据局限性和可能的偏差
5. 与其他品类的对比发现

统计报告：
{track_a_report_json}
```

---

## 六、用户画像系统（独立模块）

### 6.1 数据源

评论数据（待采集），每品类采集 2000-3000 条评论。

### 6.2 画像构建流程

```
评论原始数据
     ↓
  LLM 分类（mimo-v2-flash，快速批量处理）
  → 每条评论标注：情感倾向 / 用户类型 / 评论意图
     ↓
  传统聚类验证
  → TF-IDF + K-Means 对评论文本聚类
  → 与 LLM 分类结果交叉验证
     ↓
  LLM 画像总结（mimo-v2-pro）
  → 输出 5-8 种用户画像模板
     ↓
  画像参数化
  → 每种画像：名称、占比、语言风格、触发条件、示例评论
     ↓
  写入系统配置
  → 用于 UserSimAgent 生成更真实的模拟评论
```

### 6.3 画像分类提示词（mimo-v2-flash）

```
对以下评论进行分类，输出 JSON：
{
  "sentiment": "positive/negative/neutral",
  "user_type": "种草型/经验型/质疑型/求购型/调侃型/路人型",
  "intent": "赞美/追问/分享经验/质疑/求链接/吐槽/互动",
  "emotion_level": 1-5
}

评论："{comment_text}"
```

---

## 七、执行流程

### Step 1: 数据导入与清洗
```bash
python scripts/research/01_import_data.py
```
- 读取 `data/帖子数据_待处理/*.xlsx` + 后续新增文件
- 统一字段映射 → 写入 `backend/data/research.db`
- 计算衍生特征
- 输出清洗报告（缺失值、异常值、去重统计）

### Step 2: 封面图片下载
```bash
python scripts/research/02_download_covers.py
```
- 从 cover_url 批量下载封面图片到 `data/covers/{category}/`
- 并行下载，失败重试
- 输出下载统计

### Step 3: 传统统计分析（Track A）
```bash
python scripts/research/03_traditional_analysis.py
```
- 描述统计 → 相关性 → 回归 → 聚类
- 输出图表到 `data/research_output/charts/`
- 输出统计 JSON 到 `data/research_output/stats/`

### Step 4: LLM 分析（Track B）
```bash
python scripts/research/04_llm_analysis.py
```
- 封面视觉分析（mimo-v2-omni，并行 5 并发）
- 内容模式总结（mimo-v2-pro）
- 标签策略分析（mimo-v2-pro）
- 输出到 `data/research_output/llm/`

### Step 5: 综合报告生成
```bash
python scripts/research/05_generate_report.py
```
- 合并 Track A + Track B 结果
- 传给 mimo-v2-pro 做最终解读
- 生成可视化图表
- 输出最终报告 `data/research_output/final_report.md`

### Step 6: 用户画像（独立）
```bash
python scripts/research/06_user_persona.py
```
- 需要评论数据
- LLM 分类 + 传统聚类交叉验证
- 输出画像配置 JSON

---

## 八、模型使用策略

| 任务 | 模型 | 并发数 | 单条耗时 | 说明 |
|------|------|--------|---------|------|
| 封面视觉分析 | mimo-v2-omni | 5 | ~3s | 每张图片独立调用 |
| 评论快速分类 | mimo-v2-flash | 10 | ~0.5s | 批量处理，每次10条 |
| 内容模式总结 | mimo-v2-pro | 1 | ~10s | 每品类一次，传入50-100条摘要 |
| 标签策略分析 | mimo-v2-pro | 1 | ~8s | 每品类一次 |
| 统计报告解读 | mimo-v2-pro | 1 | ~15s | 每品类一次，传入完整统计JSON |
| 最终报告生成 | mimo-v2-pro | 1 | ~20s | 全局一次 |
| 画像总结 | mimo-v2-pro | 1 | ~10s | 每品类一次 |

**预估总调用量**（按 800 条笔记/品类 × 8 品类）：
- omni 调用：~6400 次（封面分析）
- flash 调用：~2000 次（评论分类，按 2 万条评论）
- pro 调用：~50 次（总结+分析+报告）

---

## 九、输出物

### 9.1 量化评分参数（每品类）

```json
{
  "category": "food",
  "scoring_params": {
    "title_length": { "optimal_range": [16, 22], "weight": 0.15 },
    "tag_count": { "optimal_range": [5, 8], "weight": 0.10 },
    "has_numbers": { "bonus": 5, "weight": 0.05 },
    "content_length": { "optimal_range": [200, 800], "weight": 0.10 },
    "publish_hour": { "best_hours": [17, 18, 19, 20], "weight": 0.05 },
    "cover_quality": { "weight": 0.20 },
    "content_quality": { "weight": 0.20 },
    "tag_relevance": { "weight": 0.15 }
  },
  "baseline": {
    "avg_engagement": 1234,
    "viral_threshold": 5000,
    "viral_rate": 0.12
  }
}
```

### 9.2 LLM 评价标准

每品类输出一套 Agent 用的评价提示词模板，包含从数据中提取的具体标准（而非拍脑袋的标准）。

### 9.3 用户画像模板

```json
{
  "category": "food",
  "personas": [
    {
      "name": "种草小白",
      "ratio": 0.30,
      "style": "语气热情，大量使用感叹号和表情",
      "patterns": ["看起来好好吃！", "收藏了回家试", "姐妹这个在哪买的"],
      "triggers": "产品推荐、教程类内容"
    }
  ]
}
```

### 9.4 最终研究报告

包含章节：
1. 研究背景与方法论
2. 数据概览与清洗说明
3. 各品类描述性统计
4. 相关性与回归分析结果
5. 封面视觉分析发现（LLM）
6. 内容模式分析发现（LLM）
7. 品类间差异对比
8. 用户画像研究
9. 量化评分标准制定依据
10. 局限性与后续研究方向

---

## 十、可视化清单

| 图表 | 类型 | 内容 |
|------|------|------|
| 互动量分布 | 箱线图 | 各品类 likes/collects/comments 分布 |
| 相关性矩阵 | 热力图 | 各变量间相关性 |
| 标题长度 vs 互动 | 散点图+回归线 | 控制粉丝量后的关系 |
| 标签数 vs 互动 | 折线图 | 最优标签数量 |
| 发布时段热力图 | 热力图 | 时段 × 星期 × 平均互动 |
| 品类雷达图 | 雷达图 | 各品类最优参数对比 |
| 封面风格分布 | 饼图/条形图 | LLM 分析的封面类型占比 |
| 爆款特征对比 | 分组条形图 | 爆款 vs 普通各维度对比 |
| 聚类可视化 | 散点图(PCA降维) | 笔记聚类分群 |
| 用户画像分布 | 环形图 | 各类型评论者占比 |
