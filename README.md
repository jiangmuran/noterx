# 💊 薯医 NoteRx

**AI驱动的小红书笔记诊断平台 —— 用数据告诉你，你的笔记为什么没火。**

> 你的笔记，值得被看见。

## 产品简介

薯医（NoteRx）是一个面向小红书创作者的 AI 笔记诊断工具。用户可通过 **文字粘贴**、**截图上传（OCR 自动识别）** 或 **小红书链接导入** 三种方式提交笔记，平台通过 **多 Agent 辩论架构** 和 **真实数据 Baseline 对比**，从内容、视觉、增长策略、用户反应四个维度生成全面的诊断报告。

### 核心特色

- **多 Agent 辩论诊断**：5 个 AI 专家（内容分析师、视觉诊断师、增长策略师、用户模拟器、综合裁判）并行诊断，互相质疑，给出更全面准确的诊断
- **量化 Baseline 对比**：基于数千条小红书笔记数据建立评价基线，用数据而非玄学给建议
- **AI 模拟评论区**：预测真实用户看到笔记后的反应
- **一键优化建议**：AI 生成优化标题、改写正文和封面方向建议，可一键复制
- **辩论时间线**：可视化展示 Agent 之间的赞同、反驳和补充过程
- **可分享诊断卡片**：一键导出精美诊断报告卡片，本身就是社交内容
- **三种输入方式**：文字粘贴 / 截图 OCR / 小红书链接导入
- **6 大垂类支持**：美食、穿搭、科技、旅行、美妆、健身

### 免责声明

本平台提供的诊断报告由 AI 多 Agent 协作生成，仅供参考，不构成任何运营承诺。

## 技术架构

```
前端 (React + TypeScript + Vite + Tailwind CSS + ECharts)
  ↓
API Gateway (FastAPI + Pydantic)
  ↓
┌──────────────────────────────────────────────┐
│              多模态解析层                       │
│  文本分析(jieba) | 图像分析(OpenCV) | OCR(LLM) │
│  构图分析 | 色彩和谐度 | 视觉复杂度              │
└──────────────────┬───────────────────────────┘
                   ↓
         Baseline 对比引擎 (SQLite)
                   ↓
┌──────────────────────────────────────────────┐
│       多 Agent 编排引擎 (GPT-4o / Claude)      │
│                                               │
│  Round 1: 四Agent并行诊断                       │
│    内容Agent | 视觉Agent | 增长Agent | 用户Agent │
│                   ↓                           │
│  Round 2: Agent 辩论 (赞同/反驳/补充)            │
│                   ↓                           │
│  Round 3: 综合裁判Agent → 最终报告 + 优化建议     │
└──────────────────────────────────────────────┘
```

## 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.9
- OpenAI API Key (GPT-4o) 或 Anthropic API Key (Claude)

### 安装与运行

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/noterx.git
cd noterx

# 2. 配置环境变量
cp .env.example backend/.env
# 编辑 backend/.env，填入你的 API Key

# 3. 安装依赖 + 初始化数据库（一键）
make install && make data

# 4. 一键启动
./start.sh
```

访问 `http://localhost:5173` 开始使用。

### 手动启动

```bash
# 后端
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端（新终端）
cd frontend
npm install
npm run dev
```

### Makefile 快捷命令

| 命令 | 作用 |
|------|------|
| `make install` | 安装前后端所有依赖 |
| `make data` | 初始化数据库 + 种子数据 + 计算 baseline |
| `make test` | 运行后端 pytest 测试 |
| `make ci` | 完整 CI 流程（前端构建 + 后端测试） |

## 项目结构

```
noterx/
├── frontend/                 # React 前端
│   └── src/
│       ├── components/       # UI 组件（Toast、ErrorBoundary、RadarChart 等）
│       ├── pages/            # 页面（首页/诊断动画/报告）
│       └── utils/            # API 工具、类型和 fallback 数据
├── backend/                  # Python 后端
│   ├── app/
│   │   ├── api/              # FastAPI 路由（diagnose、baseline、link 解析）
│   │   ├── agents/           # 多 Agent 模块 + 编排器
│   │   │   └── prompts/      # Agent System Prompt + 辩论 Prompt
│   │   ├── analysis/         # 多模态分析（文本/图像/OCR/构图）
│   │   ├── baseline/         # Baseline 对比引擎
│   │   ├── models/           # Pydantic 数据模型
│   │   └── utils/            # 工具模块（链接解析器等）
│   ├── data/                 # SQLite 数据库（gitignore）
│   └── tests/                # 后端单元测试
├── scripts/                  # 数据初始化脚本
├── docs/                     # 项目文档
├── .github/workflows/        # GitHub Actions CI
├── Makefile                  # 开发快捷命令
└── start.sh                  # 一键启动脚本
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/diagnose` | 笔记诊断（multipart/form-data） |
| `GET` | `/api/baseline/{category}` | 获取垂类 baseline 数据 |
| `POST` | `/api/parse-link` | 解析小红书分享链接 |
| `GET` | `/api/health` | 健康检查（含数据库状态） |

## 团队

**PageOne** — 五个13岁的创作者，用AI解决自己的问题。

## License

Apache License 2.0

---

*小红书黑客松巅峰赛作品 #小红书黑客松巅峰赛*
