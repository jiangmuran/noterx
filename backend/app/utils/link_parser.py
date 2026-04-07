"""
小红书链接解析器
从分享链接中提取笔记信息（标题、正文、标签等）。
"""
from __future__ import annotations

import re
import httpx


XHS_SHORT_PATTERN = re.compile(r"xhslink\.com/\w+")
XHS_NOTE_PATTERN = re.compile(r"xiaohongshu\.com/(?:explore|discovery/item)/([a-f0-9]+)")


async def parse_xhs_link(url: str) -> dict:
    """
    解析小红书分享链接，尝试提取笔记内容。

    @param url - 小红书笔记链接（短链或标准页面链接）
    @returns dict 包含 title, content, tags, note_id 等字段；失败时 success=False
    """
    url = url.strip()
    if not url:
        return _fail("链接为空")

    note_id = _extract_note_id(url)

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=10,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
                ),
            },
        ) as client:
            resp = await client.get(url)
            html = resp.text

        title = _extract_meta(html, "og:title") or _extract_between(html, "<title>", "</title>")
        description = _extract_meta(html, "og:description") or _extract_meta(html, "description")
        image_url = _extract_meta(html, "og:image")

        tags = []
        tag_matches = re.findall(r"#([^#\s<\"]{1,30})", description or "")
        tags = list(dict.fromkeys(tag_matches))[:10]

        if description:
            for t in tags:
                description = description.replace(f"#{t}", "").strip()

        if not title:
            return _fail("无法从页面提取标题，请手动输入")

        return {
            "success": True,
            "note_id": note_id or "",
            "title": _clean(title),
            "content": _clean(description or ""),
            "tags": tags,
            "cover_url": image_url or "",
        }

    except httpx.TimeoutException:
        return _fail("链接请求超时，请稍后重试或手动输入")
    except Exception as e:
        return _fail(f"解析失败: {str(e)[:100]}")


def _extract_note_id(url: str) -> str | None:
    """从 URL 中提取笔记 ID"""
    m = XHS_NOTE_PATTERN.search(url)
    return m.group(1) if m else None


def _extract_meta(html: str, prop: str) -> str | None:
    """提取 meta 标签内容"""
    patterns = [
        rf'<meta\s+property="{prop}"\s+content="([^"]*)"',
        rf'<meta\s+content="([^"]*)"\s+property="{prop}"',
        rf'<meta\s+name="{prop}"\s+content="([^"]*)"',
        rf'<meta\s+content="([^"]*)"\s+name="{prop}"',
    ]
    for p in patterns:
        m = re.search(p, html, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def _extract_between(html: str, start: str, end: str) -> str | None:
    """提取两个标记之间的文本"""
    idx_s = html.find(start)
    if idx_s < 0:
        return None
    idx_s += len(start)
    idx_e = html.find(end, idx_s)
    if idx_e < 0:
        return None
    return html[idx_s:idx_e].strip()


def _clean(text: str) -> str:
    """清理 HTML 实体和多余空白"""
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#39;", "'")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _fail(reason: str) -> dict:
    return {
        "success": False,
        "error": reason,
        "title": "",
        "content": "",
        "tags": [],
        "cover_url": "",
    }
