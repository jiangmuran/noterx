/**
 * 离线 fallback 数据，当后端不可用时展示
 */
import type { DiagnoseResult } from "./api";

export const FALLBACK_REPORT: DiagnoseResult = {
  overall_score: 62,
  grade: "B",
  radar_data: {
    content: 70,
    visual: 55,
    growth: 58,
    user_reaction: 65,
    overall: 62,
  },
  agent_opinions: [
    {
      agent_name: "内容分析师",
      dimension: "内容质量",
      score: 70,
      issues: [
        "标题缺少数字和具体数据，吸引力不足",
        "正文段落划分不够清晰，建议分3-5个小段",
      ],
      suggestions: [
        "在标题中加入具体数字，如「5个方法」「3步搞定」",
        "每段开头用emoji标记，增加可读性",
      ],
      reasoning:
        "标题12字，该垂类爆款平均18字，偏短。缺少钩子词和情绪词。",
      debate_comments: [],
    },
    {
      agent_name: "视觉诊断师",
      dimension: "视觉表现",
      score: 55,
      issues: [
        "封面色彩饱和度偏低，在信息流中不够醒目",
        "封面无文字覆盖，缺少信息传达",
      ],
      suggestions: [
        "提高封面饱和度到0.6以上",
        "在封面添加20%-30%的文字区域，突出核心信息",
      ],
      reasoning:
        "封面饱和度0.35，低于垂类均值0.55。建议参考爆款封面风格。",
      debate_comments: [],
    },
    {
      agent_name: "增长策略师",
      dimension: "增长策略",
      score: 58,
      issues: [
        "标签数量仅3个，该垂类爆款平均使用6个",
        "未使用任何热门标签",
      ],
      suggestions: [
        "增加至5-8个标签，混合热门标签和长尾标签",
        "建议在18:00-21:00之间发布，该时段互动率最高",
      ],
      reasoning:
        "标签覆盖率为0，未命中任何Top10热门标签。建议添加相关垂类标签。",
      debate_comments: [],
    },
    {
      agent_name: "用户模拟器",
      dimension: "用户反应",
      score: 65,
      issues: [
        "标题过于平淡，路过用户可能直接跳过",
        "缺少引导互动的话术",
      ],
      suggestions: [
        "在正文末尾添加互动引导，如「你们觉得呢？评论区聊聊」",
        "增加个人体验和真实感受，提高代入感",
      ],
      reasoning: "模拟用户反应：核心用户会点开但不一定互动，路过用户大概率跳过。",
      debate_comments: [],
    },
  ],
  issues: [
    {
      severity: "high",
      description: "标签策略严重不足，热门标签覆盖率为0",
      from_agent: "增长策略师",
    },
    {
      severity: "high",
      description: "封面视觉吸引力低于垂类平均水平",
      from_agent: "视觉诊断师",
    },
    {
      severity: "medium",
      description: "标题缺少钩子词和数字，点击率可能偏低",
      from_agent: "内容分析师",
    },
  ],
  suggestions: [
    {
      priority: 1,
      description: "增加标签至5-8个，包含至少3个垂类热门标签",
      expected_impact: "预计曝光量提升30-50%",
    },
    {
      priority: 2,
      description: "重新设计封面，提高饱和度并添加文字标题",
      expected_impact: "预计点击率提升20-40%",
    },
    {
      priority: 3,
      description: "优化标题，加入数字和情绪词",
      expected_impact: "预计点击率提升15-25%",
    },
  ],
  debate_summary:
    "4位专家一致认为标签策略是最大短板。内容分析师和用户模拟器在标题吸引力上存在轻微分歧——内容分析师认为标题信息量不够，用户模拟器则认为标题虽然平淡但不至于扣太多分。最终综合考虑，标题评分取中间值。",
  simulated_comments: [
    {
      username: "爱分享的小李",
      avatar_emoji: "👧",
      comment: "感觉还不错，但是排版可以再优化一下～",
      sentiment: "neutral",
    },
    {
      username: "挑剔的美食家",
      avatar_emoji: "🧑‍🍳",
      comment: "内容太笼统了，希望有更详细的步骤",
      sentiment: "negative",
    },
    {
      username: "路过的吃货",
      avatar_emoji: "😋",
      comment: "收藏了！下次试试看",
      sentiment: "positive",
    },
    {
      username: "认真学习中",
      avatar_emoji: "📚",
      comment: "图片拍得再好看点就完美了",
      sentiment: "neutral",
    },
    {
      username: "小红薯新人",
      avatar_emoji: "🌱",
      comment: "谢谢分享！很有帮助",
      sentiment: "positive",
    },
  ],
  optimized_title: "5步轻松搞定！零失败的懒人食谱｜新手必看🔥",
  optimized_content:
    "今天给大家分享一个超级简单的懒人食谱！\n\n✅ 食材准备（5分钟）\n只需要鸡蛋、米饭、酱油、葱花，冰箱里随时有的食材就够了。\n\n✅ 制作步骤（10分钟）\n1. 隔夜饭打散备用\n2. 鸡蛋打散加少许盐\n3. 热锅下油，先炒蛋再加饭\n4. 加酱油调色，大火翻炒\n5. 出锅撒葱花，完美！\n\n✅ 小贴士\n米饭一定要用隔夜饭，粒粒分明才好吃！\n\n你们平时最爱做什么快手菜？评论区聊聊👇",
  cover_direction: {
    layout: "上文下图或左文右图，主体食物占画面60%以上",
    color_scheme: "暖色调为主（橙色/黄色），饱和度拉高到0.6+",
    text_style: "封面大字写「5分钟搞定」，副标题「零失败懒人食谱」",
    tips: [
      "食物特写比全景更吸引人",
      "加一双筷子或手增加真实感",
      "避免滤镜过重导致食物颜色失真",
    ],
  },
  debate_timeline: [
    {
      round: 2,
      agent_name: "内容分析师",
      kind: "agree" as const,
      text: "同意增长策略师关于标签不足的判断——标签覆盖率为0确实是最大短板。",
    },
    {
      round: 2,
      agent_name: "视觉诊断师",
      kind: "rebuttal" as const,
      text: "不完全同意用户模拟器的评分。即使标题平淡，视觉封面不行才是路过用户跳过的主因。",
    },
    {
      round: 2,
      agent_name: "增长策略师",
      kind: "add" as const,
      text: "补充一个被忽略的问题：正文末尾缺少互动引导语，如「你们觉得呢？」，这会显著影响评论率。",
    },
    {
      round: 2,
      agent_name: "用户模拟器",
      kind: "agree" as const,
      text: "同意视觉诊断师的观点。封面确实需要更鲜明的色彩才能在信息流中脱颖而出。",
    },
  ],
};
