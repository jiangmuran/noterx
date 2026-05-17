import sqlite3
from pathlib import Path


def init_database(db_path: Path):
    """创建数据库表结构（如不存在）"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            title_length INTEGER,
            content TEXT,
            tags TEXT,
            publish_hour INTEGER,
            likes INTEGER DEFAULT 0,
            collects INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            followers INTEGER DEFAULT 0,
            is_viral INTEGER DEFAULT 0,
            cover_has_face INTEGER DEFAULT 0,
            cover_text_ratio REAL DEFAULT 0,
            cover_saturation REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_viral ON notes(category, is_viral)"
    )

    conn.execute("""
        CREATE TABLE IF NOT EXISTS baseline_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            metric_value REAL,
            metric_json TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, metric_name)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS diagnosis_history (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            overall_score REAL,
            grade TEXT,
            report_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_history_created
        ON diagnosis_history(created_at DESC)
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'diagnose',
            title TEXT DEFAULT '',
            category TEXT DEFAULT '',
            total_tokens INTEGER DEFAULT 0,
            duration_sec REAL DEFAULT 0,
            status TEXT DEFAULT 'ok',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at DESC)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_ip ON usage_log(ip)")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS visit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_hash TEXT NOT NULL,
            user_agent_hash TEXT DEFAULT '',
            path TEXT NOT NULL,
            referrer TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_visit_created ON visit_log(created_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_visit_visitor ON visit_log(visitor_hash)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_visit_path ON visit_log(path)")

    conn.commit()
    conn.close()

    from app.database.seed_data import seed_data
    from app.database.baseline import compute_baseline

    seed_data(db_path)
    compute_baseline(db_path)
