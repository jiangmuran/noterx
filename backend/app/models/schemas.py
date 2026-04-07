"""
Pydantic 请求 / 响应模型
"""
from pydantic import BaseModel
from typing import Optional


class DiagnoseRequest(BaseModel):
    """诊断请求体"""
    title: str
    content: str = ""
    category: str
    tags: list[str] = []
    cover_image_url: Optional[str] = None


class AgentOpinion(BaseModel):
    """单个 Agent 的诊断意见"""
    agent_name: str
    dimension: str
    score: float
    issues: list[str]
    suggestions: list[str]
    reasoning: str
    debate_comments: list[str] = []


class SimulatedComment(BaseModel):
    """AI模拟评论"""
    username: str
    avatar_emoji: str
    comment: str
    sentiment: str


class DebateEntry(BaseModel):
    """辩论时间线中的单条记录"""
    round: int
    agent_name: str
    kind: str
    text: str


class CoverDirection(BaseModel):
    """封面方向建议"""
    layout: str = ""
    color_scheme: str = ""
    text_style: str = ""
    tips: list[str] = []


class DiagnoseResponse(BaseModel):
    """诊断报告响应体"""
    overall_score: float
    grade: str
    radar_data: dict
    agent_opinions: list[AgentOpinion]
    issues: list[dict]
    suggestions: list[dict]
    debate_summary: str
    debate_timeline: list[DebateEntry] = []
    simulated_comments: list[SimulatedComment]
    optimized_title: Optional[str] = None
    optimized_content: Optional[str] = None
    cover_direction: Optional[CoverDirection] = None
