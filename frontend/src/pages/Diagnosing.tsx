import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Typography } from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import { diagnoseNote } from "../utils/api";
import type { DiagnoseResult } from "../utils/api";
import { saveHistory } from "../utils/api";
import { FALLBACK_REPORT } from "../utils/fallback";

/* ── Steps ── */
const STEPS = [
  { label: "解析笔记内容", desc: "提取标题、正文、标签信息" },
  { label: "分析封面视觉", desc: "评估构图、色彩、文字占比" },
  { label: "对比垂类数据", desc: "与数千条同类笔记基线对比" },
  { label: "内容分析师诊断", desc: "评估文案结构与可读性" },
  { label: "视觉诊断师诊断", desc: "分析封面视觉吸引力" },
  { label: "增长策略师诊断", desc: "评估标签与发布策略" },
  { label: "用户模拟器运行", desc: "模拟真实用户反应与评论" },
  { label: "Agent 辩论交锋", desc: "4 位专家互相质疑与补充" },
  { label: "综合裁判评定", desc: "汇总意见，给出最终诊断" },
  { label: "生成诊断报告", desc: "整合评分、建议与优化方案" },
];

/* ── Tips per category ── */
const TIPS: Record<string, string[]> = {
  food: [
    "美食垂类爆款标题平均 18 个字，你的够长吗？",
    "食物特写封面比全景更容易吸引点击",
    "17:00-21:00 是美食笔记互动高峰时段",
    "标签建议混合 2-3 个热门标签 + 3-4 个长尾标签",
    "带数字的标题点击率高出 30%，如「5 分钟搞定」",
  ],
  fashion: [
    "穿搭笔记真人出镜比平铺图互动率高 40%",
    "标题中带上身高体重更容易引起共鸣",
    "秋冬穿搭笔记建议在换季前 2-3 周发布",
    "穿搭封面建议：全身照 + 干净背景 + 亮色系",
    "标签记得加上体型标签，如「小个子穿搭」",
  ],
  tech: [
    "科技测评标题建议包含具体型号和使用时长",
    "数码产品封面建议：45 度角特写 + 深色背景",
    "科技垂类最佳发布时间：20:00-23:00",
    "开箱类笔记建议第一句话写结论，再展开细节",
    "对比类内容（A vs B）比单品测评更容易爆",
  ],
  travel: [
    "旅行攻略标题带具体花费更容易被收藏",
    "封面选人+景构图比纯风景点击率高 35%",
    "周末发布旅行笔记的互动率最高",
    "小众目的地比热门景点更容易出爆款",
    "标题带天数+人均花费是旅行攻略的黄金公式",
  ],
  beauty: [
    "美妆教程建议用 before/after 对比封面",
    "口红试色类笔记的收藏率远高于其他美妆内容",
    "标题带肤质标签（油皮/干皮/敏感肌）更精准触达",
    "产品测评建议标注使用时长，增加可信度",
    "美妆垂类最佳发布时间：19:00-22:00",
  ],
  fitness: [
    "健身笔记带真实数据（体重/围度变化）更有说服力",
    "动作教程封面建议用分步骤拼图",
    "减脂类笔记标题带具体数字转化率更高",
    "健身打卡类内容建议固定发布时间培养粉丝习惯",
    "对比图（前后变化）是健身垂类最强封面形式",
  ],
  lifestyle: [
    "生活方式类笔记真实感最重要，过度精致反而减分",
    "vlog 类封面建议用生活场景截帧而非摆拍",
    "独居/租房话题天然自带高共鸣",
    "标题用第一人称叙事比说教式更易共鸣",
    "生活分享最佳发布时间：21:00-23:00 睡前刷手机高峰",
  ],
  home: [
    "家居改造类封面用 before/after 对比效果最好",
    "标题带具体花费（如「花了 3000 块」）更吸引点击",
    "收纳类笔记的收藏率是家居品类中最高的",
    "小户型相关标签搜索量持续增长",
    "家居好物推荐建议附上购买渠道和价格",
  ],
  _default: [
    "标题加入数字和具体数据可以提升点击率",
    "封面文字占比建议控制在 20%-35%",
    "每段开头用关键词，方便用户快速扫读",
    "正文末尾加互动引导可以显著提升评论率",
    "标签数量建议 5-8 个，太少会影响曝光",
  ],
};

const CATEGORY_LABEL: Record<string, string> = {
  food: "美食", fashion: "穿搭", tech: "科技",
  travel: "旅行", beauty: "美妆", fitness: "健身",
  lifestyle: "生活", home: "家居",
};

export default function Diagnosing() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = location.state as {
    title: string; content: string; tags: string; category: string; coverFile: File | null; videoFile?: File | null;
  } | null;

  const [step, setStep] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const apiDone = useRef(false);
  const resultRef = useRef<{ report: unknown; isFallback: boolean } | null>(null);

  const tips = (params ? TIPS[params.category] : null) || TIPS._default;

  useEffect(() => {
    document.title = "诊断中... - 薯医 NoteRx";
    if (!params) { navigate("/"); return; }
    let cancelled = false;

    (async () => {
      try {
        const result = await diagnoseNote({
          title: params.title, content: params.content,
          category: params.category, tags: params.tags,
          coverImage: params.coverFile ?? undefined,
          videoFile: params.videoFile ?? undefined,
        });
        resultRef.current = { report: result, isFallback: false };
        saveHistory({ title: params.title, category: params.category, report: result as DiagnoseResult })
          .catch(() => {});
      } catch (err) {
        console.warn("API 不可用，使用 fallback", err);
        resultRef.current = { report: FALLBACK_REPORT, isFallback: true };
      }
      apiDone.current = true;
    })();

    const stepTimer = setInterval(() => {
      setStep((prev) => {
        if (apiDone.current && prev >= STEPS.length - 2) {
          clearInterval(stepTimer);
          setTimeout(() => {
            if (!cancelled && resultRef.current)
              navigate("/report", { state: { report: resultRef.current.report, params, isFallback: resultRef.current.isFallback } });
          }, 600);
          return STEPS.length - 1;
        }
        if (prev >= STEPS.length - 1) return prev;
        if (!apiDone.current && prev >= STEPS.length - 2) return prev;
        return prev + 1;
      });
    }, 2800);

    const tipTimer = setInterval(() => setTipIdx((p) => (p + 1) % tips.length), 5000);
    const clockTimer = setInterval(() => setElapsed((p) => p + 1), 1000);

    return () => { cancelled = true; clearInterval(stepTimer); clearInterval(tipTimer); clearInterval(clockTimer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!params) return null;

  const progress = ((step + 1) / STEPS.length) * 100;
  const tagList = params.tags ? params.tags.split(",").filter(Boolean) : [];

  return (
    <Box sx={{ position: "fixed", inset: 0, bgcolor: "#fafafa", overflow: "auto" }}>
      <Box
        sx={{
          maxWidth: 800,
          mx: "auto",
          px: { xs: 2, md: 3 },
          py: { xs: 4, md: 6 },
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: { xs: 2, md: 3 },
          minHeight: "100vh",
          alignContent: "center",
        }}
      >
        {/* Left: Note preview */}
        <Box sx={{ bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "16px", p: { xs: 2.5, md: 3 }, alignSelf: "start" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              正在诊断
            </Typography>
            {params.coverFile?.type?.startsWith("video/") && (
              <Box sx={{ px: 0.75, py: 0.125, borderRadius: "4px", bgcolor: "#fff0f1" }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#ff2442" }}>视频笔记</Typography>
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: { xs: 16, md: 18 }, fontWeight: 700, color: "#262626", lineHeight: 1.5, mb: 1.5 }}>
            {params.title || "截图识别中..."}
          </Typography>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            <Box sx={{ px: 1, py: 0.25, borderRadius: "6px", bgcolor: "#fff0f1", border: "1px solid #ffe0e3" }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#ff2442" }}>
                {CATEGORY_LABEL[params.category] || params.category}
              </Typography>
            </Box>
            {tagList.length > 0 && (
              <Typography sx={{ fontSize: 12, color: "#999", lineHeight: "24px" }}>
                {tagList.length} 个标签
              </Typography>
            )}
          </Box>

          {params.content && (
            <Typography
              sx={{
                fontSize: 13, color: "#666", lineHeight: 1.7,
                display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
                overflow: "hidden", borderTop: "1px solid #f5f5f5", pt: 1.5,
              }}
            >
              {params.content}
            </Typography>
          )}

          {/* Timer */}
          <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid #f5f5f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography sx={{ fontSize: 12, color: "#ccc" }}>
              已用时 {elapsed}s
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#ccc" }}>
              预计 30-60s
            </Typography>
          </Box>
        </Box>

        {/* Right: Progress timeline */}
        <Box sx={{ bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "16px", p: { xs: 2.5, md: 3 }, alignSelf: "start" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#999", mb: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            诊断进度
          </Typography>

          {/* Step timeline */}
          <Box sx={{ mb: 2.5 }}>
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <Box key={i} sx={{ display: "flex", gap: 1.25, mb: i < STEPS.length - 1 ? 0.75 : 0, alignItems: "flex-start" }}>
                  {/* Status indicator */}
                  <Box sx={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", mt: 0.125 }}>
                    {done ? (
                      <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: "#16a34a" }} />
                    ) : active ? (
                      <motion.div
                        animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#ff2442" }} />
                      </motion.div>
                    ) : (
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#e0e0e0" }} />
                    )}
                  </Box>
                  {/* Label */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: done ? "#16a34a" : active ? "#262626" : "#ccc",
                        lineHeight: 1.4,
                        transition: "color 0.3s",
                      }}
                    >
                      {s.label}
                    </Typography>
                    {active && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.3 }}>
                        <Typography sx={{ fontSize: 11, color: "#999", mt: 0.125 }}>
                          {s.desc}
                        </Typography>
                      </motion.div>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Progress bar */}
          <Box sx={{ height: 4, bgcolor: "#f0f0f0", borderRadius: 2, overflow: "hidden", mb: 1 }}>
            <Box
              sx={{
                height: "100%", bgcolor: "#ff2442", borderRadius: 2,
                width: `${progress}%`,
                transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </Box>
          <Typography sx={{ fontSize: 12, color: "#bbb", textAlign: "right" }}>
            {Math.round(progress)}%
          </Typography>
        </Box>

        {/* Bottom: Tips (full width) */}
        <Box
          sx={{
            gridColumn: { xs: "1", md: "1 / -1" },
            bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "12px",
            px: { xs: 2, md: 2.5 }, py: 1.5,
            display: "flex", alignItems: "center", gap: 1.5,
            minHeight: 44,
          }}
        >
          <Box sx={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
              <text x="8" y="11.5" textAnchor="middle" fill="#f59e0b" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">i</text>
            </svg>
          </Box>
          <AnimatePresence mode="wait">
            <motion.div
              key={tipIdx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              style={{ flex: 1 }}
            >
              <Typography sx={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                {tips[tipIdx]}
              </Typography>
            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>
    </Box>
  );
}
