"""
本地记忆层（参考 OpenClaw：Markdown 为可读的「真源」之一，JSON 存完整报告副本）。

目录（位于 backend/data/noterx_workspace）：
- MEMORY.md          长期说明（可手工编辑）
- memory/YYYY-MM-DD.md   按日追加的诊断摘要
- memory/records/{id}.json  单条完整报告（与 SQLite 同步写入）
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime

logger = logging.getLogger("noterx.local_memory")

_DATA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
WORKSPACE_ROOT = os.path.join(_DATA_ROOT, "noterx_workspace")
MEMORY_MD = os.path.join(WORKSPACE_ROOT, "MEMORY.md")
MEMORY_DIR = os.path.join(WORKSPACE_ROOT, "memory")
RECORDS_DIR = os.path.join(MEMORY_DIR, "records")

MEMORY_MD_TEMPLATE = """# NoteRx 本地记忆（MEMORY）

本文件为**长期说明区**，可随意增删改；诊断流水按日写在 `memory/YYYY-MM-DD.md`，完整 JSON 在 `memory/records/`。

## 用途

- 人类可读：`grep`、编辑器、版本管理（若你愿意把本目录纳入 git）均可。
- 完整数据仍以 `memory/records/<id>.json` 与 SQLite `diagnosis_history` 双写；数据库便于列表检索，文件便于备份与恢复。

## 提示

- 删除某条历史时，对应 `records` 下的 JSON 会一并删除；当日志 md 中仍保留摘要行，便于审计。
"""


def _ensure_dirs() -> None:
    os.makedirs(RECORDS_DIR, exist_ok=True)


def ensure_memory_md() -> None:
    """若不存在则创建 MEMORY.md（OpenClaw 风格入口文件）。"""
    _ensure_dirs()
    if not os.path.isfile(MEMORY_MD):
        try:
            with open(MEMORY_MD, "w", encoding="utf-8") as f:
                f.write(MEMORY_MD_TEMPLATE)
            logger.info("已初始化本地记忆文件: %s", MEMORY_MD)
        except OSError as e:
            logger.warning("无法写入 MEMORY.md: %s", e)


def _safe_title(title: str) -> str:
    return (title or "").replace("\n", " ").replace("\r", "").strip()[:120]


def _day_path(when: datetime | None = None) -> str:
    d = when or datetime.now()
    return os.path.join(MEMORY_DIR, f"{d.strftime('%Y-%m-%d')}.md")


def write_diagnosis_record(
    record_id: str,
    title: str,
    category: str,
    overall_score: float,
    grade: str,
    report: dict,
) -> None:
    """
    写入单日 Markdown 摘要 + records 下完整 JSON。
    @param record_id - 与 SQLite 主键一致
    """
    ensure_memory_md()
    _ensure_dirs()

    title_s = _safe_title(title)
    now = datetime.now()
    time_str = now.strftime("%H:%M:%S")

    payload = {
        "id": record_id,
        "title": title,
        "category": category,
        "overall_score": overall_score,
        "grade": grade,
        "saved_at_local": now.isoformat(timespec="seconds"),
        "report": report,
    }

    json_path = os.path.join(RECORDS_DIR, f"{record_id}.json")
    try:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except OSError as e:
        logger.error("写入记录 JSON 失败 %s: %s", json_path, e)
        return

    day_file = _day_path(now)
    block = (
        f"\n## {time_str} · [{category}] {title_s}\n\n"
        f"- **得分** {overall_score:g} · **等级** {grade}\n"
        f"- **id** `{record_id}`\n"
        f"- **完整 JSON** `memory/records/{record_id}.json`\n\n"
    )
    try:
        existed = os.path.isfile(day_file)
        with open(day_file, "a", encoding="utf-8") as f:
            if not existed:
                f.write(f"# 诊断流水 · {now.strftime('%Y-%m-%d')}\n\n")
            f.write(block)
    except OSError as e:
        logger.warning("追加日日志失败 %s: %s", day_file, e)


def delete_diagnosis_record(record_id: str) -> None:
    """删除 JSON 副本；并在当日 md 末尾追加删除标记。"""
    _ensure_dirs()
    json_path = os.path.join(RECORDS_DIR, f"{record_id}.json")
    try:
        if os.path.isfile(json_path):
            os.remove(json_path)
    except OSError as e:
        logger.warning("删除记录 JSON 失败 %s: %s", json_path, e)

    now = datetime.now()
    day_file = _day_path(now)
    line = f"\n> 已删除记录 `{record_id}` · {now.strftime('%H:%M:%S')}\n\n"
    try:
        with open(day_file, "a", encoding="utf-8") as f:
            if not os.path.isfile(day_file) or os.path.getsize(day_file) == 0:
                f.write(f"# 诊断流水 · {now.strftime('%Y-%m-%d')}\n\n")
            f.write(line)
    except OSError as e:
        logger.warning("写入删除标记失败 %s: %s", day_file, e)
