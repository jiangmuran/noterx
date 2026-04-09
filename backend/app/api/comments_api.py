"""
模拟评论生成 API
使用 flash 模型快速生成更多评论、回复和争论。
"""
import json
import logging
from pydantic import BaseModel
from fastapi import APIRouter

from app.agents.base_agent import BaseAgent, MODEL_FAST

router = APIRouter()
logger = logging.getLogger("noterx.comments")

COMMENT_PROMPT = """你是小红书评论区模拟器。模拟真实小红书评论区的样子。

## 核心规则：禁止AI味
- 不要用"非常""建议""值得"这类书面词
- 用真实网友的说话方式：口语、缩写、网络用语、打错字

## 评论风格参考（真实高赞评论）
短评："绝了" / "马住" / "蹲" / "做了！" / "啊啊啊啊啊好好看" / "求链接" / "什么价位"
中评："姐妹这个在哪买的啊 我找了好久" / "试了 真的有用 已经推荐给闺蜜了"
长评："作为一个XX了3年的人说一下，这个方法确实可以但是有个坑要注意……"
质疑："广吧" / "srds感觉一般" / "有滤镜吧这个" / "我买了翻车了怎么办"
纯凑热闹："哈哈哈哈哈前排" / "我就知道评论区有人会问" / "来了来了"

## 昵称风格
必须像真实XHS用户：如"是小鹿呀""减脂第30天""北漂打工人""暴躁小张""奶茶续命中""考研倒计时xx天""爱吃的CC"

## 必须满足
1. 40%短评(5-12字)、30%中评(15-40字)、30%长评(40-100字)
2. 至少1条质疑/吐槽（不是所有人都夸）
3. 至少2条有回复（模拟楼中楼讨论）
4. 每条评论带字段：username, comment, sentiment, likes(数字0-999), time_ago(如"3小时前""昨天""2天前"), ip_location(如"北京""广东""浙江""四川")
5. 可以有1条标记 is_author:true 的作者回复

## JSON格式
{"comments":[{"username":"昵称","comment":"内容","sentiment":"positive/negative/neutral","likes":数字,"time_ago":"时间","ip_location":"省份","is_author":false,"replies":[同结构]}]}

生成5-6条主评论，2-3条有回复。"""


class GenerateCommentsRequest(BaseModel):
    title: str
    content: str = ""
    category: str = "food"
    existing_count: int = 0


@router.post("/generate-comments")
async def generate_comments(req: GenerateCommentsRequest):
    """用 flash 模型快速生成更多模拟评论"""
    category_names = {"food": "美食", "fashion": "穿搭", "tech": "科技",
                      "travel": "旅行", "beauty": "美妆", "fitness": "健身"}
    cat_cn = category_names.get(req.category, req.category)

    user_msg = f"""笔记信息：
- 垂类：{cat_cn}
- 标题：{req.title}
- 正文：{req.content[:300] if req.content else '（无正文）'}

已有 {req.existing_count} 条评论，请生成新的、不重复的评论。
如果已有评论较多，可以生成一些更有争议性的评论和激烈的回复。"""

    agent = BaseAgent(model=MODEL_FAST)
    agent.system_prompt = COMMENT_PROMPT
    result = await agent.call_llm(user_msg, max_tokens=2000)

    result.pop("_meta", None)
    comments = result.get("comments", [])

    formatted = []
    for c in comments:
        if not isinstance(c, dict):
            continue
        replies = []
        for r in c.get("replies", []):
            if isinstance(r, dict):
                replies.append({
                    "username": r.get("username", "小红薯用户"),
                    "comment": r.get("comment", ""),
                    "sentiment": r.get("sentiment", "neutral"),
                    "likes": int(r.get("likes", 0)) if r.get("likes") is not None else 0,
                    "time_ago": r.get("time_ago", "刚刚"),
                    "ip_location": r.get("ip_location", ""),
                    "is_author": bool(r.get("is_author", False)),
                })
        formatted.append({
            "username": c.get("username", "小红薯用户"),
            "comment": c.get("comment", ""),
            "sentiment": c.get("sentiment", "neutral"),
            "likes": int(c.get("likes", 0)) if c.get("likes") is not None else 0,
            "time_ago": c.get("time_ago", "刚刚"),
            "ip_location": c.get("ip_location", ""),
            "is_author": bool(c.get("is_author", False)),
            "replies": replies,
        })

    return {"comments": formatted}
