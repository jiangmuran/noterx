import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { Box, Typography, useTheme, useMediaQuery, Alert, Button } from "@mui/material";

import { preScore, diagnoseStream, diagnoseNote, DIAGNOSE_CLIENT_MAX_MS } from "../utils/api";
import type { PreScoreResult, StreamEvent } from "../utils/api";

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
  { label: "数据预评分", desc: "基于大量数据训练的流量预测模型" },
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
  debate_agent_0: 8,
  debate_agent_1: 8,
  debate_agent_2: 8,
  debate_agent_3: 9,
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

/* (CATEGORY_LABEL removed — category shown via preScoreData.category_cn) */



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
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const params = location.state as {
    title: string;
    content: string;
    tags: string;
    category: string;
    coverFile: File | null;
    coverImages?: File[];
    videoFile?: File | null;
  } | null;

  const [step, setStep] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [factIdx, setFactIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [preScoreData, setPreScoreData] = useState<PreScoreResult | null>(null);
  const [streamMsg, setStreamMsg] = useState<string>("");
  const [debateMsgs, setDebateMsgs] = useState<string[]>([]);
  const apiDone = useRef(false);
  const hasRealtimeProgress = useRef(false);
  const resultRef = useRef<{ report: unknown; isFallback: boolean } | null>(null);
  /** 任意 SSE 事件刷新，用于检测「长时间无推送」卡死 */
  const lastSseActivityRef = useRef<number>(Date.now());
  const stallTriggeredRef = useRef(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const tips = (params ? TIPS[params.category] : null) || TIPS._default;

  useEffect(() => {
    document.title = "诊断中... - 薯医 NoteRx";
    if (!params) { navigate("/app"); return; }
    let cancelled = false;
    const abortController = new AbortController();

    // Phase 1: Instant pre-score
    preScore({
      title: params.title, content: params.content,
      category: params.category, tags: params.tags,
      image_count: params.coverImages?.length ?? (params.coverFile ? 1 : 0),
    }).then((ps) => {
      if (!cancelled) {
        setPreScoreData(ps);
        setStep(1); // Move past "数据预评分"
      }
    }).catch(() => {});

    /** 流式诊断结束后若仍为 false，再尝试 POST /diagnose */
    let streamEndedWithServerError = false;

    const touchSse = () => {
      lastSseActivityRef.current = Date.now();
    };

    // Phase 2: Full diagnosis via SSE stream (fallback to normal POST)
    (async () => {
      try {
        await diagnoseStream(
          {
            title: params.title, content: params.content,
            category: params.category, tags: params.tags,
            coverImage: params.coverFile ?? undefined,
            coverImages: params.coverImages ?? undefined,
            videoFile: params.videoFile ?? undefined,
          },
          (event: StreamEvent) => {
            if (cancelled) return;
            touchSse();
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
              if (event.data.step?.startsWith("debate_agent_")) {
                setDebateMsgs((prev) => [...prev, event.data.message]);
              }
            } else if (event.type === "result") {
              resultRef.current = { report: event.data, isFallback: false };
              apiDone.current = true;
            } else if (event.type === "error") {
              streamEndedWithServerError = true;
              const msg =
                typeof event.data?.message === "string"
                  ? event.data.message
                  : "服务端诊断失败";
              setTerminalError(msg);
              apiDone.current = true;
            }
          },
          abortController.signal,
        );
        if (streamEndedWithServerError) {
          return;
        }
        if (!resultRef.current) {
          const result = await diagnoseNote({
            title: params.title, content: params.content,
            category: params.category, tags: params.tags,
            coverImage: params.coverFile ?? undefined,
            coverImages: params.coverImages ?? undefined,
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
            coverImages: params.coverImages ?? undefined,
            videoFile: params.videoFile ?? undefined,
          });
          resultRef.current = { report: result, isFallback: false };
        } catch (e2: unknown) {
          let msg = "诊断请求失败，请检查网络与后端是否已启动";
          if (axios.isAxiosError(e2)) {
            const d = e2.response?.data;
            if (d && typeof d === "object" && "detail" in d) {
              const det = (d as { detail: unknown }).detail;
              msg = typeof det === "string" ? det : JSON.stringify(det);
            } else if (e2.message) {
              msg = e2.message;
            }
          } else if (e2 instanceof Error && e2.message) {
            msg = e2.message;
          }
          setTerminalError(msg);
        }
      }
      apiDone.current = true;
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

    /**
     * 整单最长等待；超时不再用演示数据，改为明确错误 + 重试。
     */
    const timeoutTimer = setTimeout(() => {
      if (!apiDone.current && !cancelled) {
        setTerminalError(
          `诊断超过 ${DIAGNOSE_CLIENT_MAX_MS / 1000}s 仍未结束。可在 frontend/.env 增大 VITE_DIAGNOSE_MAX_WAIT_MS，或检查后端/模型是否卡住。`,
        );
        apiDone.current = true;
      }
    }, DIAGNOSE_CLIENT_MAX_MS);

    /** 长时间无任何 SSE 推送则判定连接卡死（默认 120s，每 10s 检查） */
    const stallCheckMs = 120_000;
    const stallIv = setInterval(() => {
      if (cancelled || apiDone.current || stallTriggeredRef.current) return;
      if (Date.now() - lastSseActivityRef.current > stallCheckMs) {
        stallTriggeredRef.current = true;
        setTerminalError(
          "诊断流长时间无数据（可能后端或模型无响应）。请查看后端日志或稍后重试。",
        );
        apiDone.current = true;
      }
    }, 10_000);

    return () => {
      cancelled = true;
      abortController.abort(); // 取消 SSE / fetch，与离开页卸载一致
      clearInterval(stepTimer);
      clearInterval(tipTimer);
      clearInterval(clockTimer);
      clearInterval(factTimer);
      clearInterval(stallIv);
      clearTimeout(timeoutTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!params) return null;

  if (terminalError) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "#faf9f7",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          gap: 2,
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 440, width: "100%", borderRadius: "12px" }}>
          {terminalError}
        </Alert>
        <Button
          variant="contained"
          onClick={() => navigate("/app", { replace: true })}
          sx={{
            bgcolor: "#ff2442",
            textTransform: "none",
            fontWeight: 700,
            px: 3,
            borderRadius: "10px",
            "&:hover": { bgcolor: "#e61e3d" },
          }}
        >
          返回首页重试
        </Button>
      </Box>
    );
  }

  const progress = ((step + 1) / STEPS.length) * 100;


  return (
    <Box sx={{ position: "fixed", inset: 0, bgcolor: "#faf9f7", display: "flex", flexDirection: "column" }}>

      {/* ═══ Top bar ═══ */}
      <Box sx={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        px: { xs: 1.5, md: 3 }, height: 48,
        borderBottom: "1px solid #f0f0f0",
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ flexShrink: 0, display: "flex" }}
          >
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#ff2442" }} />
          </motion.div>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {params.title || "诊断中"}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0, ml: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: "#bbb", display: { xs: "none", sm: "block" } }}>
            {streamMsg || "预计 30-60s"}
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#555", fontVariantNumeric: "tabular-nums", bgcolor: "#f5f5f5", px: 1, py: 0.25, borderRadius: "6px" }}>
            {elapsed}s
          </Typography>
        </Box>
      </Box>

      {/* ═══ Content ═══ */}
      <Box sx={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center" }}>
        <Box sx={{
          width: "100%", maxWidth: 960,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "300px 1fr" },
          gap: { xs: 2.5, md: 4 },
          px: { xs: 2, md: 3 },
          py: { xs: 2.5, md: 3.5 },
          alignContent: "start",
          alignItems: "start",
        }}>

          {/* ═══ Left column: Score ═══ */}
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            {/* Score ring or placeholder — no mode="wait" to avoid flash */}
            {preScoreData ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <ScoreRing score={preScoreData.total_score} size={isDesktop ? 140 : 110} />
                <Box sx={{ textAlign: "center" }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", mb: 0.25,
                    maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {params.title || "未命名笔记"}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "center" }}>
                    <Typography sx={{ fontSize: 11, color: "#999" }}>
                      {preScoreData.category_cn}
                    </Typography>
                    <Box sx={{
                      px: 0.5, py: 0.1, borderRadius: "4px",
                      bgcolor: preScoreData.total_score >= 85 ? "#dcfce7" : preScoreData.total_score >= 70 ? "#fef3c7" : "#fee2e2",
                    }}>
                      <Typography sx={{
                        fontSize: 10, fontWeight: 700,
                        color: preScoreData.total_score >= 85 ? "#16a34a" : preScoreData.total_score >= 70 ? "#d97706" : "#dc2626",
                      }}>
                        {preScoreData.level}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </motion.div>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
                  <Box sx={{
                    width: isDesktop ? 140 : 110, height: isDesktop ? 140 : 110,
                    borderRadius: "50%", border: "3px solid #f0f0f0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Typography sx={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>评分中</Typography>
                  </Box>
                </motion.div>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#999",
                  maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
                  {params.title || "正在分析..."}
                </Typography>
              </Box>
            )}

            {/* Dimension bars — desktop: always show; mobile: only when data ready */}
            {preScoreData && (
              <Box sx={{ width: "100%", maxWidth: 280 }}>
                {Object.entries(preScoreData.dimensions).map(([key, val]) => (
                  <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.6, "&:last-child": { mb: 0 } }}>
                    <Typography sx={{ fontSize: 11, color: "#999", minWidth: 44, textAlign: "right" }}>
                      {DIM_LABELS[key] || key}
                    </Typography>
                    <Box sx={{ flex: 1, height: 5, bgcolor: "#f5f5f5", borderRadius: 3, overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${val}%` }}
                        transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                        style={{ height: "100%", borderRadius: 3, background: DIM_COLORS[key] || "#10b981" }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#666", minWidth: 24, textAlign: "right" }}>
                      {Math.round(val)}
                    </Typography>
                  </Box>
                ))}
                <Typography sx={{ fontSize: 10, color: "#ccc", mt: 1, textAlign: "center" }}>
                  基于大量数据训练
                </Typography>
              </Box>
            )}
          </Box>


          {/* ═══ Right column: Step Timeline ═══ */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>

            {/* Progress bar at top */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ height: 4, bgcolor: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                <Box sx={{
                  height: "100%", borderRadius: 2, bgcolor: "#ff2442",
                  width: `${progress}%`,
                  transition: "width 0.5s ease",
                }} />
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                <Typography sx={{ fontSize: 11, color: "#999" }}>{step + 1}/{STEPS.length}</Typography>
                <Typography sx={{ fontSize: 11, color: "#bbb" }}>{elapsed}s</Typography>
              </Box>
            </Box>

            {/* Vertical step timeline */}
            {STEPS.map((s, i) => {
              const isDone = i < step;
              const isActive = i === step;
              
              const isDebatePhase = i === 8;
              const isJudgePhase = i === 9;

              return (
                <Box key={i} sx={{ display: "flex", gap: 1.5, pb: i < STEPS.length - 1 ? 0 : 0 }}>
                  {/* Timeline line + dot */}
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
                    <Box sx={{
                      width: isDone ? 16 : isActive ? 18 : 12,
                      height: isDone ? 16 : isActive ? 18 : 12,
                      borderRadius: "50%",
                      bgcolor: isDone ? "#10b981" : isActive ? "#ff2442" : "#e8e8e8",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.3s",
                      boxShadow: isActive ? "0 0 8px rgba(255,36,66,0.3)" : "none",
                    }}>
                      {isDone && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                      {isActive && (
                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff" }} />
                      )}
                    </Box>
                    {i < STEPS.length - 1 && (
                      <Box sx={{
                        width: 2, flex: 1, minHeight: 16,
                        bgcolor: isDone ? "#10b981" : "#f0f0f0",
                        transition: "background-color 0.3s",
                      }} />
                    )}
                  </Box>

                  {/* Step content */}
                  <Box sx={{ flex: 1, minWidth: 0, pb: 1.5 }}>
                    <Typography sx={{
                      fontSize: isActive ? 14 : 13,
                      fontWeight: isActive ? 700 : isDone ? 500 : 400,
                      color: isDone ? "#10b981" : isActive ? "#1a1a1a" : "#ccc",
                      lineHeight: 1.3,
                      transition: "all 0.3s",
                    }}>
                      {s.label}
                    </Typography>
                    {isActive && (
                      <Typography sx={{ fontSize: 11, color: "#999", mt: 0.25 }}>
                        {s.desc}
                      </Typography>
                    )}

                    {/* Debate phase: show live messages */}
                    {isDebatePhase && (isDone || isActive) && debateMsgs.length > 0 && (
                      <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                        {debateMsgs.map((msg, j) => {
                          const colors = ["#ff2442", "#8b5cf6", "#f59e0b", "#3b82f6"];
                          const bgColors = ["#fff5f6", "#faf5ff", "#fffbeb", "#eff6ff"];
                          return (
                            <Box key={j} sx={{
                              px: 1.25, py: 0.75, borderRadius: "8px",
                              bgcolor: bgColors[j % 4],
                              borderLeft: `2px solid ${colors[j % 4]}`,
                            }}>
                              <Typography sx={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>
                                {msg}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    )}

                    {/* Judge phase: show status */}
                    {isJudgePhase && isActive && (
                      <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                          <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#10b981" }} />
                        </motion.div>
                        <Typography sx={{ fontSize: 11, color: "#10b981" }}>
                          综合裁判正在评定最终报告...
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}

            {/* Tips / Quiz below timeline */}
            <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #f0f0f0" }}>
              <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#10b981", mb: 0.5, letterSpacing: "0.04em" }}>
                数据洞察
              </Typography>
              <AnimatePresence mode="wait">
                <motion.div key={tipIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <Typography sx={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                    {tips[tipIdx]}
                  </Typography>
                </motion.div>
              </AnimatePresence>
            </Box>

            <Box
              onClick={() => setShowAnswer(true)}
              sx={{
                mt: 1.5, p: 1.5, borderRadius: "10px", cursor: "pointer",
                bgcolor: showAnswer ? "#fff5f6" : "#f9f9f9",
                border: showAnswer ? "1px solid #fecaca" : "1px solid transparent",
                transition: "all 0.3s",
              }}
            >
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: showAnswer ? "#ff2442" : "#bbb", mb: 0.25 }}>
                {showAnswer ? "答案" : "猜一猜"}
              </Typography>
              <AnimatePresence mode="wait">
                <motion.div key={`${factIdx}-${showAnswer}`}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: showAnswer ? 700 : 500,
                    color: showAnswer ? "#ff2442" : "#1a1a1a", lineHeight: 1.5 }}>
                    {showAnswer ? FUN_FACTS[factIdx].a : FUN_FACTS[factIdx].q}
                  </Typography>
                </motion.div>
              </AnimatePresence>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
