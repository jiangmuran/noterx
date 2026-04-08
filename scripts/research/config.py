"""研究系统共享配置"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 路径
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "帖子数据_待处理"
COVERS_DIR = DATA_DIR / "covers"
OUTPUT_DIR = DATA_DIR / "research_output"
CHARTS_DIR = OUTPUT_DIR / "charts"
STATS_DIR = OUTPUT_DIR / "stats"
LLM_DIR = OUTPUT_DIR / "llm"
RESEARCH_DB = PROJECT_ROOT / "backend" / "data" / "research.db"

# 确保目录存在
for d in [COVERS_DIR, CHARTS_DIR, STATS_DIR, LLM_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# 加载 .env
load_dotenv(PROJECT_ROOT / "backend" / ".env", override=False)

# API 配置
API_KEY = os.getenv("OPENAI_API_KEY", "")
API_BASE = os.getenv("OPENAI_BASE_URL", "https://api.xiaomimimo.com/v1")
MODEL_FAST = os.getenv("LLM_MODEL_FAST", "mimo-v2-flash")
MODEL_PRO = os.getenv("LLM_MODEL_PRO", "mimo-v2-pro")
MODEL_OMNI = os.getenv("LLM_MODEL_OMNI", "mimo-v2-omni")

# 品类映射（原始文件名 → 内部品类 key）
FILE_CATEGORY_MAP = {
    "美食帖": "food",
    "穿搭帖": "fashion",
    "时尚帖": "fashion",   # 时尚和穿搭合并为 fashion
    "科技帖": "tech",
    "旅游帖": "travel",
    "美妆帖": "beauty",
    "健身帖": "fitness",
    "生活帖": "lifestyle",
    "家居帖": "home",
}

ALL_CATEGORIES = ["food", "fashion", "tech", "travel", "beauty", "fitness", "lifestyle", "home"]

# 并发控制
OMNI_CONCURRENCY = 5    # 多模态分析并发数
FLASH_CONCURRENCY = 10  # flash 模型并发数
DOWNLOAD_CONCURRENCY = 20  # 图片下载并发数

# 粉丝量分桶
FAN_BUCKETS = [
    ("nano", 0, 1_000),
    ("micro", 1_000, 10_000),
    ("mid", 10_000, 100_000),
    ("macro", 100_000, 10**9),
]
