"""
链接解析 API
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.utils.link_parser import parse_xhs_link

router = APIRouter()


class ParseLinkRequest(BaseModel):
    """链接解析请求"""
    url: str


@router.post("/parse-link")
async def parse_link(req: ParseLinkRequest):
    """
    解析小红书分享链接，返回笔记标题/正文/标签等内容。

    @param req - 包含 url 字段的请求体
    """
    result = await parse_xhs_link(req.url)
    return result
