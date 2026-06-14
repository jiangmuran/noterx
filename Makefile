.PHONY: data install test ci

# 一键初始化数据库并生成 baseline
data:
	cd backend && python3 -c "from app.database import init_database; from pathlib import Path; init_database(Path('data') / 'baseline.db')"

# 清空种子和基线后重新初始化
data-refresh:
	cd backend && python3 -c "from app.database import init_database; from pathlib import Path; init_database(Path('data') / 'baseline.db', force=True)"

# 安装所有依赖
install:
	cd backend && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt
	cd frontend && npm install

# 后端测试
test:
	cd backend && . venv/bin/activate && python -m pytest tests/ -v

# CI 检查（构建+测试）
ci: test
	cd frontend && npx tsc --noEmit && npx vite build
