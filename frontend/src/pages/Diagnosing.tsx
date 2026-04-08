import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Typography } from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import { preScore, diagnoseStream, diagnoseNote } from "../utils/api";
import type { DiagnoseResult, PreScoreResult, StreamEvent } from "../utils/api";
import { saveHistory } from "../utils/api";
import { FALLBACK_REPORT } from "../utils/fallback";

/* ── Dimension labels ── */
const DIM_LABELS: Record<string, string> = {
  title_quality: "标题质量",
  content_quality: "内容质量",
  visual_quality: "视觉表现",
  tag_strategy: "标签策略",
  engagement_potential: "互动潜力",
};

const DIM_COLORS: Record<string, string> = {
  title_quality: "#10b981",
  content_quality: "#3b82f6",
  visual_quality: "#f59e0b",
  tag_strategy: "#8b5cf6",
  engagement_potential: "#ff6b6b",
};

/* ── Steps ── */
const STEPS = [
  { label: "数据预评分", desc: "基于 874 条真实数据即时量化" },
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

const EVENT_STEP_MAP: Record<string, number> = {
  parse_start: 1,
  parse_done: 2,
  baseline_start: 3,
  baseline_done: 3,
  round1_start: 4,
  round1_content_done: 4,
  round1_visual_done: 5,
  round1_growth_done: 6,
  round1_user_done: 7,
  round1_done: 8,
  debate_start: 8,
  debate_done: 9,
  judge_start: 9,
  judge_done: 10,
  finalizing: 10,
};

/* ── Tips per category ── */
const TIPS: Record<string, string[]> = {
  food: [
    "美食爆款标题平均 18.3 字，标题权重占比 57.3%",
    "食物特写封面比全景更容易吸引点击",
    "17:00 是黄金发布时段（互动量是凌晨的 5658 倍）",
    "最优标签数 4-8 个，6 个标签效果最佳",
    "中等长度正文（100-300字）互动量最高",
    "视频笔记互动量是图文的 2.25 倍",
  ],
  fashion: [
    "穿搭品类 98.3% 的互动差异由视觉决定，文字几乎无效",
    "爆款标题平均仅 14 字，简短精炼即可",
    "评论区 63% 正面情绪，种草型用户占 25.4%",
    "多图展示（2-10张）效果最好",
    "穿搭封面建议：全身照 + 干净背景",
  ],
  tech: [
    "科技品类图片数量是最强预测因子（β=0.41）",
    "含数字的标题互动显著更高",
    "长文在科技赛道有优势（87-517字最优）",
    "经验型评论占 37%，科技用户爱分享心得",
    "科技品类负面评论 27%，最高的品类",
  ],
  travel: [
    "旅游品类标签是最强预测因子（β=0.52）",
    "营销感标题反而降低互动（β=-0.51）",
    "图片 4-14 张，需要多图展示",
    "真实分享 > 套路标题",
    "标题带天数+人均花费是黄金公式",
  ],
  _default: [
    "3 个钩子元素最优（互动 21,132），4 个反而崩塌",
    "视频笔记互动量是图文的 2.25 倍",
    "17:00 是全品类黄金发布时段",
    "标签数量 4-8 个最佳",
    "Macro 作者互动是素人的 52 倍，但内容优化可缩小差距",
  ],
};

/* ── Fun facts that rotate during wait ── */
const FUN_FACTS = [
  { q: "小红书互动量最高的一条笔记有多少互动？", a: "270,670！标题只用了情感+好奇心" },
  { q: "凌晨 3 点和下午 5 点发笔记，互动量差多少倍？", a: "5,658 倍！同样的内容，发布时间决定生死" },
  { q: "穿搭品类，文字能解释多少互动差异？", a: "只有 1.7%！剩余 98.3% 靠图片说话" },
  { q: "有一条没有标题的笔记，互动量是多少？", a: "55,637！纯靠封面图的力量" },
  { q: "评论区最高赞的一条评论有多少赞？", a: "39,000 赞！比绝大多数笔记还火" },
  { q: "钩子元素越多越好吗？", a: "不是！3个最佳，4个反而崩塌到只有 5,826" },
  { q: "我们分析了多少条真实评论？", a: "2,465 条，AI 分类成 6 种用户类型" },
  { q: "科技品类头部笔记是均值的多少倍？", a: "24.4 倍！赢家通吃最严重的品类" },
];

const CATEGORY_LABEL: Record<string, string> = {
  food: "美食", fashion: "穿搭", tech: "科技",
  travel: "旅行", beauty: "美妆", fitness: "健身",
  lifestyle: "生活", home: "家居",
};


/* ── Agent status config ── */
const AGENTS = [
  { name: "content", label: "内容分析师", activeStep: 4, doneStep: 5 },
  { name: "visual", label: "视觉诊断师", activeStep: 4, doneStep: 6 },
  { name: "growth", label: "增长策略师", activeStep: 4, doneStep: 7 },
  { name: "user", label: "用户模拟器", activeStep: 4, doneStep: 8 },
  { name: "judge", label: "综合裁判", activeStep: 9, doneStep: 10 },
];

/* ── Score ring component ── */
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 85 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ff6b6b";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={6} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.28} fontWeight="800"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

export default function Diagnosing() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = location.state as {
    title: string; content: string; tags: string; category: string; coverFile: File | null; videoFile?: File | null;
  } | null;

  const [step, setStep] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [factIdx, setFactIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [preScoreData, setPreScoreData] = useState<PreScoreResult | null>(null);
  const [streamMsg, setStreamMsg] = useState<string>("");
  const apiDone = useRef(false);
  const hasRealtimeProgress = useRef(false);
  const resultRef = useRef<{ report: unknown; isFallback: boolean } | null>(null);

  const tips = (params ? TIPS[params.category] : null) || TIPS._default;

  useEffect(() => {
    document.title = "诊断中... - 薯医 NoteRx";
    if (!params) { navigate("/app"); return; }
    let cancelled = false;

    // Phase 1: Instant pre-score
    preScore({
      title: params.title, content: params.content,
      category: params.category, tags: params.tags,
      image_count: params.coverFile ? 1 : 0,
    }).then((ps) => {
      if (!cancelled) {
        setPreScoreData(ps);
        setStep(1); // Move past "数据预评分"
      }
    }).catch(() => {});

    // Phase 2: Full diagnosis via SSE stream (fallback to normal POST)
    (async () => {
      try {
        await diagnoseStream(
          {
            title: params.title, content: params.content,
            category: params.category, tags: params.tags,
            coverImage: params.coverFile ?? undefined,
            videoFile: params.videoFile ?? undefined,
          },
          (event: StreamEvent) => {
            if (cancelled) return;
            if (event.type === "pre_score") {
              setPreScoreData(event.data as unknown as PreScoreResult);
              setStep(1);
            } else if (event.type === "progress") {
              hasRealtimeProgress.current = true;
              setStreamMsg(event.data.message);
              const mapped = EVENT_STEP_MAP[event.data.step];
              if (mapped !== undefined) {
                setStep((prev) => Math.max(prev, mapped));
              }
            } else if (event.type === "result") {
              resultRef.current = { report: event.data, isFallback: false };
              apiDone.current = true;
            } else if (event.type === "error") {
              console.warn("Stream error:", event.data.message);
            }
          },
        );
        // SSE completed
        if (!resultRef.current) {
          // Fallback to normal POST
          const result = await diagnoseNote({
            title: params.title, content: params.content,
            category: params.category, tags: params.tags,
            coverImage: params.coverFile ?? undefined,
            videoFile: params.videoFile ?? undefined,
          });
          resultRef.current = { report: result, isFallback: false };
        }
      } catch (err) {
        console.warn("SSE 不可用，降级到普通请求", err);
        try {
          const result = await diagnoseNote({
            title: params.title, content: params.content,
            category: params.category, tags: params.tags,
            coverImage: params.coverFile ?? undefined,
            videoFile: params.videoFile ?? undefined,
          });
          resultRef.current = { report: result, isFallback: false };
        } catch {
          resultRef.current = { report: FALLBACK_REPORT, isFallback: true };
        }
      }
      apiDone.current = true;
      if (!cancelled) {
        saveHistory({ title: params.title, category: params.category, report: resultRef.current!.report as DiagnoseResult })
          .catch(() => {});
      }
    })();

    // Step timer (fills gaps between real events)
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
        if (hasRealtimeProgress.current) return prev;
        if (prev >= STEPS.length - 1) return prev;
        if (!apiDone.current && prev >= STEPS.length - 2) return prev;
        return prev + 1;
      });
    }, 3500);

    const tipTimer = setInterval(() => setTipIdx((p) => (p + 1) % tips.length), 4500);
    const clockTimer = setInterval(() => setElapsed((p) => p + 1), 1000);
    const factTimer = setInterval(() => { setFactIdx((p) => (p + 1) % FUN_FACTS.length); setShowAnswer(false); }, 8000);

    // Timeout: 90s fallback
    const timeoutTimer = setTimeout(() => {
      if (!apiDone.current && !cancelled) {
        console.warn("诊断超时，使用 fallback");
        resultRef.current = { report: FALLBACK_REPORT, isFallback: true };
        apiDone.current = true;
      }
    }, 90000);

    return () => { cancelled = true; clearInterval(stepTimer); clearInterval(tipTimer); clearInterval(clockTimer); clearInterval(factTimer); clearTimeout(timeoutTimer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!params) return null;

  const progress = ((step + 1) / STEPS.length) * 100;

  const currentStep = STEPS[Math.min(step, STEPS.length - 1)];

  return (
    <Box sx={{
      position: "fixed", inset: 0,
      background: "linear-gradient(180deg, #fafafa 0%, #f5f3f7 50%, #fafafa 100%)",
      display: "flex", flexDirection: "column", overflow: "auto",
    }}>
      {/* ── Top bar ── */}
      <Box sx={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        px: { xs: 2, md: 3 }, py: 1.25,
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        bgcolor: "rgba(255,255,255,0.7)", backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
          {/* Pulsing dot */}
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ flexShrink: 0 }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#ff2442" }} />
          </motion.div>
          <Box sx={{ px: 0.75, py: 0.25, borderRadius: "6px", bgcolor: "#fff0f1", border: "1px solid #ffe0e3", flexShrink: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#ff2442" }}>
              {CATEGORY_LABEL[params.category] || params.category}
            </Typography>
          </Box>
          <Typography sx={{
            fontSize: 13, fontWeight: 600, color: "#262626",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {params.title || "截图识别中..."}
          </Typography>
          {params.coverFile?.type?.startsWith("video/") && (
            <Box sx={{ px: 0.5, py: 0.125, borderRadius: "4px", bgcolor: "#fff0f1", flexShrink: 0 }}>
              <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#ff2442" }}>视频</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, ml: 1 }}>
          <Typography sx={{ fontSize: 11, color: "#bbb" }}>
            {streamMsg || "预计 30-60s"}
          </Typography>
          <Box sx={{
            px: 0.75, py: 0.25, borderRadius: "6px",
            bgcolor: "rgba(0,0,0,0.04)",
          }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#666", fontVariantNumeric: "tabular-nums" }}>
              {elapsed}s
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Main ── */}
      <Box sx={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 3.5 }, gap: { xs: 2, md: 2.5 },
        maxWidth: 640, mx: "auto", width: "100%",
      }}>

        {/* ── Score area: placeholder or actual ring ── */}
        <AnimatePresence mode="wait">
          {preScoreData ? (
            <motion.div
              key="score"
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.2, 0, 0.2, 1] }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}
            >
              <ScoreRing score={preScoreData.total_score} size={130} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#262626" }}>
                  {preScoreData.category_cn}品类
                </Typography>
                <Box sx={{
                  px: 0.75, py: 0.2, borderRadius: "8px",
                  bgcolor: preScoreData.total_score >= 85 ? "#dcfce7" : preScoreData.total_score >= 70 ? "#fef3c7" : "#fee2e2",
                }}>
                  <Typography sx={{
                    fontSize: 12, fontWeight: 700,
                    color: preScoreData.total_score >= 85 ? "#16a34a" : preScoreData.total_score >= 70 ? "#d97706" : "#dc2626",
                  }}>
                    {preScoreData.level}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: "#bbb" }}>· 快速评估</Typography>
              </Box>

              {/* Dimension bars inline */}
              <Box sx={{
                width: "100%", bgcolor: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)",
                borderRadius: "16px", border: "1px solid rgba(0,0,0,0.06)", p: 2,
                boxShadow: "0 2px 12px rgba(0,0,0,0.03)",
              }}>
                {Object.entries(preScoreData.dimensions).map(([key, val]) => (
                  <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75, "&:last-child": { mb: 0 } }}>
                    <Typography sx={{ fontSize: 12, color: "#888", minWidth: 52, textAlign: "right", fontWeight: 500 }}>
                      {DIM_LABELS[key] || key}
                    </Typography>
                    <Box sx={{ flex: 1, height: 7, bgcolor: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${val}%` }}
                        transition={{ duration: 1.2, ease: [0.2, 0, 0.2, 1], delay: 0.2 }}
                        style={{ height: "100%", borderRadius: 4, background: DIM_COLORS[key] || "#10b981" }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#555", minWidth: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(val)}
                    </Typography>
                  </Box>
                ))}
                <Typography sx={{ fontSize: 10, color: "#bbb", mt: 1.25, textAlign: "center" }}>
                  基于 {preScoreData.baseline.sample_size} 条真实数据 · 平均互动 {preScoreData.baseline.avg_engagement.toLocaleString()} · 爆款线 {preScoreData.baseline.viral_threshold.toLocaleString()}
                </Typography>
              </Box>
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
            >
              <motion.div
                animate={{ scale: [1, 1.06, 1], opacity: [0.35, 0.65, 0.35] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Box sx={{
                  width: 130, height: 130, borderRadius: "50%",
                  border: "4px solid rgba(255,36,66,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "radial-gradient(circle, rgba(255,36,66,0.04) 0%, transparent 70%)",
                }}>
                  <Typography sx={{ fontSize: 15, color: "#ccc", fontWeight: 700 }}>
                    评分中
                  </Typography>
                </Box>
              </motion.div>
              <Typography sx={{ fontSize: 12, color: "#bbb" }}>
                正在基于 874 条数据进行快速评估...
              </Typography>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Current step heading ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            style={{ textAlign: "center", width: "100%" }}
          >
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#262626", mb: 0.25 }}>
              {currentStep.label}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#999" }}>
              {currentStep.desc}
            </Typography>
          </motion.div>
        </AnimatePresence>

        {/* ── Agent status strip ── */}
        <Box sx={{ width: "100%", display: "flex", gap: { xs: 0.75, md: 1 }, justifyContent: "center", flexWrap: "wrap" }}>
          {AGENTS.map((agent, i) => {
            const isDone = step >= agent.doneStep;
            const isActive = !isDone && step >= agent.activeStep;
            return (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
                style={{ flex: "1 1 0", minWidth: 68, maxWidth: 116 }}
              >
                <Box sx={{
                  py: 1.25, px: 0.75,
                  borderRadius: "14px", border: "1.5px solid",
                  borderColor: isDone ? "#bbf7d0" : isActive ? "#fecaca" : "rgba(0,0,0,0.06)",
                  bgcolor: isDone ? "rgba(240,253,244,0.9)" : isActive ? "rgba(255,245,246,0.9)" : "rgba(255,255,255,0.85)",
                  textAlign: "center", transition: "all 0.4s ease",
                  boxShadow: isDone
                    ? "0 0 16px rgba(16,185,129,0.12)"
                    : isActive
                      ? "0 0 16px rgba(255,36,66,0.12)"
                      : "0 1px 4px rgba(0,0,0,0.03)",
                  backdropFilter: "blur(8px)",
                }}>
                  <Box sx={{ mb: 0.5, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isDone ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
                        <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: "#16a34a" }} />
                      </motion.div>
                    ) : isActive ? (
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                        style={{ display: "inline-flex" }}
                      >
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#ff2442",
                          boxShadow: "0 0 8px rgba(255,36,66,0.4)" }} />
                      </motion.div>
                    ) : (
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#ddd" }} />
                    )}
                  </Box>
                  <Typography sx={{
                    fontSize: 11, fontWeight: isDone || isActive ? 600 : 400,
                    color: isDone ? "#16a34a" : isActive ? "#ff2442" : "#bbb",
                    lineHeight: 1.3, letterSpacing: "0.01em",
                  }}>
                    {agent.label}
                  </Typography>
                </Box>
              </motion.div>
            );
          })}
        </Box>

        {/* ── Progress bar with shimmer ── */}
        <Box sx={{ width: "100%" }}>
          <Box sx={{
            height: 8, bgcolor: "rgba(0,0,0,0.04)", borderRadius: 4, overflow: "hidden",
            position: "relative",
          }}>
            <Box sx={{
              height: "100%", borderRadius: 4,
              background: "linear-gradient(90deg, #10b981 0%, #3b82f6 40%, #ff2442 100%)",
              width: `${progress}%`,
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
              position: "relative",
              "&::after": {
                content: '""', position: "absolute", inset: 0,
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                animation: "shimmer 2s infinite",
              },
            }} />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.75 }}>
            <Typography sx={{ fontSize: 12, color: "#999", fontWeight: 500 }}>
              {Math.round(progress)}% · {step + 1}/{STEPS.length}
            </Typography>
          </Box>
        </Box>

        {/* ── Tips card ── */}
        <Box sx={{
          width: "100%", bgcolor: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(0,0,0,0.06)", borderRadius: "14px",
          px: 2, py: 1.5, display: "flex", alignItems: "flex-start", gap: 1.5,
          boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
        }}>
          <Box sx={{
            width: 24, height: 24, borderRadius: "8px", bgcolor: "rgba(16,185,129,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.125,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#10b981" strokeWidth="1.5" fill="none" />
              <text x="8" y="11.5" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="700" fontFamily="Inter,sans-serif">i</text>
            </svg>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#10b981", mb: 0.25, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              数据洞察
            </Typography>
            <AnimatePresence mode="wait">
              <motion.div key={tipIdx} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.3 }}>
                <Typography sx={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                  {tips[tipIdx]}
                </Typography>
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>

        {/* ── Fun fact quiz ── */}
        <motion.div
          style={{ width: "100%" }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <Box
            sx={{
              bgcolor: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)",
              border: showAnswer ? "1.5px solid rgba(255,36,66,0.2)" : "1px solid rgba(0,0,0,0.06)",
              borderRadius: "14px", px: 2, py: 2, cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: showAnswer ? "0 0 20px rgba(255,36,66,0.06)" : "0 1px 4px rgba(0,0,0,0.03)",
            }}
            onClick={() => setShowAnswer(true)}
          >
            <Typography sx={{
              fontSize: 10, fontWeight: 700,
              color: showAnswer ? "#ff2442" : "#bbb",
              mb: 0.75, textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              {showAnswer ? "答案揭晓" : "猜一猜"}
            </Typography>
            <AnimatePresence mode="wait">
              <motion.div key={`${factIdx}-${showAnswer}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}>
                <Typography sx={{
                  fontSize: 15, fontWeight: showAnswer ? 700 : 500,
                  color: showAnswer ? "#ff2442" : "#262626", lineHeight: 1.65,
                }}>
                  {showAnswer ? FUN_FACTS[factIdx].a : FUN_FACTS[factIdx].q}
                </Typography>
              </motion.div>
            </AnimatePresence>
            {!showAnswer && (
              <Typography sx={{ fontSize: 11, color: "#ccc", mt: 0.75, fontWeight: 500 }}>
                点击揭晓答案
              </Typography>
            )}
          </Box>
        </motion.div>
      </Box>

    </Box>
  );
}
