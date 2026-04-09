"""
管理员统计面板 API
密码通过 SHA-512 硬编码验证
"""
from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

router = APIRouter()
logger = logging.getLogger("noterx.admin")

# SHA-512 of admin password — hardcoded
ADMIN_PASSWORD_SHA512 = "a776a66c6d2846ba069697bb56f68fedfe301a453126cf4af1d566296cd8ae903b591520c4fbb51592f1fa206b7a4c3baeb79a3dde67167a108b885835813cba"
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "baseline.db")


def _verify_password(password: str) -> bool:
    return hashlib.sha512(password.encode()).hexdigest() == ADMIN_PASSWORD_SHA512


def _get_stats() -> dict:
    """Collect all statistics from the database and system."""
    stats = {
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": time.time() - _start_time,
    }

    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        # Note count
        cur.execute("SELECT COUNT(*) FROM notes")
        stats["total_notes"] = cur.fetchone()[0]

        # Notes per category
        cur.execute("SELECT category, COUNT(*) FROM notes GROUP BY category ORDER BY COUNT(*) DESC")
        stats["notes_by_category"] = {row[0]: row[1] for row in cur.fetchall()}

        # Baseline stats per category
        cur.execute("SELECT DISTINCT category FROM baseline_stats")
        stats["baseline_categories"] = [row[0] for row in cur.fetchall()]

        # Diagnosis history count
        try:
            cur.execute("SELECT COUNT(*) FROM diagnosis_history")
            stats["total_diagnoses"] = cur.fetchone()[0]

            # Recent diagnoses
            cur.execute("SELECT category, COUNT(*) FROM diagnosis_history GROUP BY category ORDER BY COUNT(*) DESC")
            stats["diagnoses_by_category"] = {row[0]: row[1] for row in cur.fetchall()}

            # Last 10 diagnoses
            cur.execute("SELECT id, title, category, overall_score, created_at FROM diagnosis_history ORDER BY created_at DESC LIMIT 10")
            stats["recent_diagnoses"] = [
                {"id": row[0], "title": row[1][:30] if row[1] else "", "category": row[2], "score": row[3], "time": row[4]}
                for row in cur.fetchall()
            ]
        except Exception:
            stats["total_diagnoses"] = 0
            stats["diagnoses_by_category"] = {}
            stats["recent_diagnoses"] = []

        # Avg engagement per category
        cur.execute("""
            SELECT category, metric_name, metric_value
            FROM baseline_stats
            WHERE metric_name IN ('avg_likes', 'avg_collects', 'avg_comments', 'viral_rate')
        """)
        engagement = {}
        for row in cur.fetchall():
            cat, metric, val = row
            if cat not in engagement:
                engagement[cat] = {}
            engagement[cat][metric] = val
        stats["engagement_by_category"] = engagement

        conn.close()
    except Exception as e:
        stats["db_error"] = str(e)

    # System info
    try:
        import psutil
        mem = psutil.virtual_memory()
        stats["system"] = {
            "cpu_percent": psutil.cpu_percent(),
            "memory_used_mb": round(mem.used / 1024 / 1024),
            "memory_total_mb": round(mem.total / 1024 / 1024),
            "memory_percent": mem.percent,
        }
    except ImportError:
        stats["system"] = {"note": "psutil not installed"}

    return stats


_start_time = time.time()


ADMIN_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>薯医 Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,'Noto Sans SC',sans-serif;background:#faf9f7;color:#262626;line-height:1.6}
.login{min-height:100vh;display:flex;align-items:center;justify-content:center}
.login-box{background:#fff;border:1px solid #f0f0f0;border-radius:16px;padding:40px;max-width:360px;width:100%;text-align:center}
.login-box h1{font-size:20px;font-weight:800;margin-bottom:8px}
.login-box p{font-size:13px;color:#999;margin-bottom:24px}
.login-box input{width:100%;padding:10px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none}
.login-box input:focus{border-color:#ff2442}
.login-box button{width:100%;padding:10px;margin-top:12px;background:#ff2442;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.login-box button:hover{background:#e61e3d}
.login-box .err{color:#dc2626;font-size:12px;margin-top:8px}

.dash{max-width:960px;margin:0 auto;padding:24px 16px}
.dash h1{font-size:22px;font-weight:800;margin-bottom:4px}
.dash .sub{font-size:12px;color:#999;margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px}
.card{background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:16px}
.card .label{font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
.card .val{font-size:28px;font-weight:900;color:#ff2442;margin-top:4px}
.card .val.green{color:#16a34a}
.card .val.blue{color:#3b82f6}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #f0f0f0;margin-bottom:24px}
th{background:#262626;color:#fff;padding:8px 12px;font-size:11px;font-weight:600;text-align:left}
td{padding:8px 12px;font-size:13px;border-bottom:1px solid #f5f5f5}
tr:hover td{background:#fafafa}
.section{font-size:15px;font-weight:700;margin:24px 0 12px}
.bar{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.bar .name{font-size:12px;color:#666;width:60px;text-align:right}
.bar .track{flex:1;height:6px;background:#f0f0f0;border-radius:3px;overflow:hidden}
.bar .fill{height:100%;background:#ff2442;border-radius:3px}
.bar .num{font-size:11px;font-weight:600;color:#555;width:40px}
</style>
</head>
<body>
<div id="app"></div>
<script>
const app=document.getElementById('app');
let token='';

function showLogin(err){
  app.innerHTML=`<div class="login"><div class="login-box">
    <h1>薯医 Admin</h1><p>管理员统计面板</p>
    <input type="password" id="pw" placeholder="输入管理员密码" onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">进入</button>
    ${err?'<div class=err>'+err+'</div>':''}
  </div></div>`;
  document.getElementById('pw')?.focus();
}

async function doLogin(){
  const pw=document.getElementById('pw').value;
  try{
    const r=await fetch('/admin/api/stats?password='+encodeURIComponent(pw));
    if(!r.ok){showLogin('密码错误');return;}
    token=pw;
    const data=await r.json();
    showDash(data);
  }catch(e){showLogin('连接失败');}
}

function showDash(d){
  const cats=Object.entries(d.notes_by_category||{});
  const maxNotes=Math.max(...cats.map(c=>c[1]),1);
  const diags=d.recent_diagnoses||[];
  const engCats=Object.entries(d.engagement_by_category||{});

  app.innerHTML=`<div class="dash">
    <h1>薯医 Admin Dashboard</h1>
    <div class="sub">${d.timestamp} · uptime ${Math.round(d.uptime_seconds/60)}min</div>

    <div class="grid">
      <div class="card"><div class="label">训练笔记</div><div class="val">${d.total_notes||0}</div></div>
      <div class="card"><div class="label">诊断次数</div><div class="val blue">${d.total_diagnoses||0}</div></div>
      <div class="card"><div class="label">基线品类</div><div class="val green">${(d.baseline_categories||[]).length}</div></div>
      <div class="card"><div class="label">内存</div><div class="val" style="font-size:18px">${d.system?.memory_used_mb||'?'}/${d.system?.memory_total_mb||'?'}MB</div></div>
    </div>

    <div class="section">品类分布</div>
    ${cats.map(([cat,n])=>`<div class="bar"><div class="name">${cat}</div><div class="track"><div class="fill" style="width:${n/maxNotes*100}%"></div></div><div class="num">${n}</div></div>`).join('')}

    <div class="section">品类互动数据</div>
    <table><tr><th>品类</th><th>平均赞</th><th>平均藏</th><th>平均评</th><th>爆款率</th></tr>
    ${engCats.map(([cat,m])=>`<tr><td>${cat}</td><td>${m.avg_likes?.toFixed(0)||'-'}</td><td>${m.avg_collects?.toFixed(0)||'-'}</td><td>${m.avg_comments?.toFixed(0)||'-'}</td><td>${m.viral_rate?m.viral_rate.toFixed(1)+'%':'-'}</td></tr>`).join('')}
    </table>

    <div class="section">最近诊断</div>
    <table><tr><th>标题</th><th>品类</th><th>分数</th><th>时间</th></tr>
    ${diags.map(r=>`<tr><td>${r.title||'—'}</td><td>${r.category}</td><td style="font-weight:700;color:${r.score>=75?'#16a34a':r.score>=50?'#d97706':'#dc2626'}">${r.score||'—'}</td><td style="font-size:11px;color:#999">${r.time||''}</td></tr>`).join('')}
    ${diags.length===0?'<tr><td colspan=4 style="color:#999;text-align:center">暂无诊断记录</td></tr>':''}
    </table>

    <button onclick="location.reload()" style="background:#262626;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:600">刷新数据</button>
  </div>`;
}

showLogin();
</script>
</body>
</html>"""


@router.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return ADMIN_HTML


@router.get("/admin/api/stats")
async def admin_stats(password: str = Query(...)):
    if not _verify_password(password):
        raise HTTPException(403, "密码错误")
    return _get_stats()
