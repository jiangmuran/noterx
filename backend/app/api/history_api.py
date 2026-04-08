"""
诊断历史记录 CRUD API
"""
import json
import logging
import os
import sqlite3
import uuid

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import HistoryCreateRequest, HistoryListItem, HistoryDetail
from app import local_memory

router = APIRouter()
logger = logging.getLogger("noterx.history")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "baseline.db")


def _get_conn() -> sqlite3.Connection:
    """获取 SQLite 连接（row_factory = Row）"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@router.post("/history", response_model=dict)
async def create_history(req: HistoryCreateRequest):
    """
    保存一条诊断历史记录。
    @param req - 包含 title, category, report(完整 DiagnoseResponse dict)
    @returns {id: str} 新记录的 UUID
    """
    record_id = uuid.uuid4().hex
    report = req.report
    overall_score = report.get("overall_score", 0)
    grade = report.get("grade", "")

    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO diagnosis_history
               (id, title, category, overall_score, grade, report_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (record_id, req.title, req.category, overall_score, grade, json.dumps(report, ensure_ascii=False)),
        )
        conn.commit()
    except Exception as e:
        logger.error("保存历史记录失败: %s", e)
        raise HTTPException(500, "保存失败")
    finally:
        conn.close()

    try:
        local_memory.write_diagnosis_record(
            record_id, req.title, req.category, float(overall_score or 0), grade or "", report
        )
    except Exception as e:
        logger.warning("写入本地记忆文件失败（不影响数据库）: %s", e)

    return {"id": record_id}


@router.get("/history", response_model=list[HistoryListItem])
async def list_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    获取历史记录列表（按时间倒序，不含完整报告 JSON）。
    @param limit - 每页条数（默认 20，最大 100）
    @param offset - 偏移量
    """
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT id, title, category, overall_score, grade, created_at
               FROM diagnosis_history
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()
    finally:
        conn.close()

    return [
        HistoryListItem(
            id=r["id"],
            title=r["title"],
            category=r["category"],
            overall_score=r["overall_score"] or 0,
            grade=r["grade"] or "",
            created_at=r["created_at"] or "",
        )
        for r in rows
    ]


@router.get("/history/{record_id}", response_model=HistoryDetail)
async def get_history(record_id: str):
    """
    获取单条历史记录详情（含完整报告）。
    @param record_id - UUID
    """
    conn = _get_conn()
    try:
        row = conn.execute(
            """SELECT id, title, category, overall_score, grade, report_json, created_at
               FROM diagnosis_history WHERE id = ?""",
            (record_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(404, "记录不存在")

    return HistoryDetail(
        id=row["id"],
        title=row["title"],
        category=row["category"],
        overall_score=row["overall_score"] or 0,
        grade=row["grade"] or "",
        created_at=row["created_at"] or "",
        report=json.loads(row["report_json"]),
    )


@router.delete("/history/{record_id}")
async def delete_history(record_id: str):
    """
    删除一条历史记录。
    @param record_id - UUID
    """
    conn = _get_conn()
    try:
        cur = conn.execute("DELETE FROM diagnosis_history WHERE id = ?", (record_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "记录不存在")
    finally:
        conn.close()

    try:
        local_memory.delete_diagnosis_record(record_id)
    except Exception as e:
        logger.warning("删除本地记忆文件时出错: %s", e)

    return {"ok": True}
