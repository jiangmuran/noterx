import sqlite3
from pathlib import Path

from app.database.schema import create_tables


def init_database(db_path: Path, force: bool = False):
    """创建数据库表结构（如不存在）；force=True 时清空种子和基线后重写"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    create_tables(conn)
    conn.commit()
    conn.close()

    from app.database.seed_data import seed_data
    from app.database.baseline import compute_baseline

    seed_data(db_path, force=force)
    compute_baseline(db_path, force=force)
