"""
管理员统计面板 — 使用追踪 + 系统状态
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

ADMIN_PASSWORD_SHA512 = "a776a66c6d2846ba069697bb56f68fedfe301a453126cf4af1d566296cd8ae903b591520c4fbb51592f1fa206b7a4c3baeb79a3dde67167a108b885835813cba"
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "baseline.db")
_start_time = time.time()


def _verify_password(password: str) -> bool:
    import hmac
    return hmac.compare_digest(
        hashlib.sha512(password.encode()).hexdigest(),
        ADMIN_PASSWORD_SHA512,
    )


def _get_stats() -> dict:
    stats = {"timestamp": datetime.utcnow().isoformat(), "uptime_seconds": time.time() - _start_time}
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        # Notes
        cur.execute("SELECT COUNT(*) FROM notes")
        stats["total_notes"] = cur.fetchone()[0]
        cur.execute("SELECT category, COUNT(*) FROM notes GROUP BY category ORDER BY COUNT(*) DESC")
        stats["notes_by_category"] = {r[0]: r[1] for r in cur.fetchall()}

        # Usage log
        try:
            cur.execute("SELECT COUNT(*) FROM usage_log")
            stats["total_requests"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(DISTINCT ip) FROM usage_log")
            stats["unique_ips"] = cur.fetchone()[0]
            cur.execute("SELECT SUM(total_tokens) FROM usage_log")
            stats["total_tokens"] = cur.fetchone()[0] or 0
            cur.execute("SELECT AVG(duration_sec) FROM usage_log WHERE duration_sec > 0")
            avg = cur.fetchone()[0]
            stats["avg_duration_sec"] = round(avg, 1) if avg else 0

            # Today
            cur.execute("SELECT COUNT(*), COUNT(DISTINCT ip) FROM usage_log WHERE date(created_at)=date('now')")
            row = cur.fetchone()
            stats["today_requests"] = row[0]
            stats["today_ips"] = row[1]

            # By category
            cur.execute("SELECT category, COUNT(*) FROM usage_log GROUP BY category ORDER BY COUNT(*) DESC")
            stats["usage_by_category"] = {r[0]: r[1] for r in cur.fetchall()}

            # Top IPs
            cur.execute("SELECT ip, COUNT(*) as c FROM usage_log GROUP BY ip ORDER BY c DESC LIMIT 15")
            stats["top_ips"] = [{"ip": r[0], "count": r[1]} for r in cur.fetchall()]

            # Recent 20
            cur.execute("SELECT ip, action, title, category, total_tokens, duration_sec, status, created_at FROM usage_log ORDER BY created_at DESC LIMIT 20")
            stats["recent_usage"] = [
                {"ip": r[0], "action": r[1], "title": (r[2] or "")[:30], "category": r[3], "tokens": r[4], "duration": r[5], "status": r[6], "time": r[7]}
                for r in cur.fetchall()
            ]

            # Hourly distribution (last 24h)
            cur.execute("""
                SELECT strftime('%H', created_at) as hour, COUNT(*) as c
                FROM usage_log WHERE created_at > datetime('now', '-24 hours')
                GROUP BY hour ORDER BY hour
            """)
            stats["hourly_24h"] = {r[0]: r[1] for r in cur.fetchall()}
        except Exception:
            stats["total_requests"] = 0
            stats["unique_ips"] = 0
            stats["recent_usage"] = []

        # Engagement
        cur.execute("""
            SELECT category, metric_name, metric_value FROM baseline_stats
            WHERE metric_name IN ('avg_likes','avg_collects','avg_comments','viral_rate')
        """)
        eng = {}
        for r in cur.fetchall():
            eng.setdefault(r[0], {})[r[1]] = r[2]
        stats["engagement_by_category"] = eng

    except Exception as e:
        stats["db_error"] = str(e)
    finally:
        if conn:
            conn.close()

    try:
        import psutil
        mem = psutil.virtual_memory()
        stats["system"] = {"cpu_percent": psutil.cpu_percent(), "memory_used_mb": round(mem.used/1024/1024), "memory_total_mb": round(mem.total/1024/1024), "memory_percent": mem.percent}
    except ImportError:
        stats["system"] = {}
    return stats


ADMIN_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
.login-box .err{color:#dc2626;font-size:12px;margin-top:8px}
.d{max-width:960px;margin:0 auto;padding:24px 16px}
.d h1{font-size:22px;font-weight:800;margin-bottom:4px}
.d .sub{font-size:12px;color:#999;margin-bottom:20px}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px}
.c{background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:14px}
.c .l{font-size:10px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
.c .v{font-size:24px;font-weight:900;color:#ff2442;margin-top:2px}
.c .v.g2{color:#16a34a}.c .v.b{color:#3b82f6}.c .v.o{color:#f59e0b}.c .v.sm{font-size:16px}
.s{font-size:14px;font-weight:700;margin:20px 0 10px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #f0f0f0;margin-bottom:20px;font-size:12px}
th{background:#262626;color:#fff;padding:6px 10px;font-size:10px;font-weight:600;text-align:left}
td{padding:6px 10px;border-bottom:1px solid #f5f5f5}
tr:hover td{background:#fafafa}
.bar{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.bar .n{font-size:11px;color:#666;width:50px;text-align:right}
.bar .t{flex:1;height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden}
.bar .f{height:100%;background:#ff2442;border-radius:3px}
.bar .num{font-size:10px;font-weight:600;color:#555;width:30px}
.ip{font-family:monospace;font-size:11px;color:#666}
.tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600}
.tag.ok{background:#f0fdf4;color:#16a34a}.tag.err{background:#fef2f2;color:#dc2626}
.refresh{background:#262626;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px}
</style>
</head>
<body>
<div id="app"></div>
<script>
const app=document.getElementById('app');let token='';
function showLogin(err){
  app.innerHTML=`<div class="login"><div class="login-box"><h1>薯医 Admin</h1><p>管理员面板</p>
  <input type="password" id="pw" placeholder="密码" onkeydown="if(event.key==='Enter')doLogin()">
  <button onclick="doLogin()">进入</button>${err?'<div class=err>'+err+'</div>':''}</div></div>`;
  document.getElementById('pw')?.focus();
}
async function doLogin(){
  const pw=document.getElementById('pw').value;
  try{const r=await fetch('/admin/api/stats?password='+encodeURIComponent(pw));
  if(!r.ok){showLogin('密码错误');return;}token=pw;showDash(await r.json());}catch(e){showLogin('连接失败');}
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function showDash(d){
  const hrs=d.hourly_24h||{};const maxH=Math.max(...Object.values(hrs),1);
  const topIps=d.top_ips||[];const maxIp=topIps[0]?.count||1;
  const usage=d.recent_usage||[];
  const cats=Object.entries(d.usage_by_category||{});const maxCat=Math.max(...cats.map(c=>c[1]),1);
  app.innerHTML=`<div class="d">
  <h1>薯医 Admin</h1><div class="sub">${d.timestamp} · uptime ${Math.round(d.uptime_seconds/60)}min</div>
  <div class="g">
    <div class="c"><div class="l">今日诊断</div><div class="v">${d.today_requests||0}</div></div>
    <div class="c"><div class="l">今日 UV</div><div class="v b">${d.today_ips||0}</div></div>
    <div class="c"><div class="l">总诊断</div><div class="v g2">${d.total_requests||0}</div></div>
    <div class="c"><div class="l">总 UV</div><div class="v o">${d.unique_ips||0}</div></div>
    <div class="c"><div class="l">总 Token</div><div class="v sm">${(d.total_tokens||0).toLocaleString()}</div></div>
    <div class="c"><div class="l">平均耗时</div><div class="v sm">${d.avg_duration_sec||0}s</div></div>
    <div class="c"><div class="l">训练笔记</div><div class="v sm">${d.total_notes||0}</div></div>
    <div class="c"><div class="l">内存</div><div class="v sm">${d.system?.memory_used_mb||'?'}/${d.system?.memory_total_mb||'?'}</div></div>
  </div>
  <div class="s">24h 请求分布</div>
  <div style="display:flex;gap:3px;align-items:end;height:60px;margin-bottom:16px">
    ${Array.from({length:24},(_,i)=>{const h=String(i).padStart(2,'0');const v=hrs[h]||0;
    return `<div title="${h}:00 → ${v}次" style="flex:1;background:${v?'#ff2442':'#f0f0f0'};height:${Math.max(v/maxH*100,2)}%;border-radius:2px;cursor:pointer"></div>`;}).join('')}
  </div>
  <div class="s">品类诊断分布</div>
  ${cats.map(([c,n])=>`<div class="bar"><div class="n">${c}</div><div class="t"><div class="f" style="width:${n/maxCat*100}%"></div></div><div class="num">${n}</div></div>`).join('')}
  <div class="s">Top IP</div>
  <table><tr><th>IP</th><th>次数</th><th>占比</th></tr>
  ${topIps.map(r=>`<tr><td class="ip">${esc(r.ip)}</td><td>${r.count}</td><td>${d.total_requests?Math.round(r.count/d.total_requests*100):0}%</td></tr>`).join('')}</table>
  <div class="s">最近诊断</div>
  <table><tr><th>时间</th><th>IP</th><th>标题</th><th>品类</th><th>Token</th><th>耗时</th><th>状态</th></tr>
  ${usage.map(r=>`<tr><td style="font-size:10px;color:#999;white-space:nowrap">${(r.time||'').slice(5,16)}</td><td class="ip">${esc(r.ip)}</td><td>${esc(r.title)||'—'}</td><td>${esc(r.category)}</td><td>${r.tokens||0}</td><td>${r.duration||0}s</td><td><span class="tag ${r.status==='ok'?'ok':'err'}">${esc(r.status)}</span></td></tr>`).join('')}
  ${usage.length===0?'<tr><td colspan=7 style="color:#999;text-align:center">暂无记录</td></tr>':''}</table>
  <button class="refresh" onclick="doRefresh()">刷新</button>
  <span id="autoLabel" style="font-size:11px;color:#999;margin-left:12px">每30秒自动刷新</span></div>`;
}
async function doRefresh(){
  if(!token)return;
  try{const r=await fetch('/admin/api/stats?password='+encodeURIComponent(token));
  if(r.ok)showDash(await r.json());}catch(e){}
}
// Auto-refresh every 30s
setInterval(()=>{if(token)doRefresh();},30000);
showLogin();
</script></body></html>"""


@router.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return ADMIN_HTML


@router.get("/admin/api/stats")
async def admin_stats(password: str = Query(...)):
    if not _verify_password(password):
        raise HTTPException(403, "密码错误")
    return _get_stats()
