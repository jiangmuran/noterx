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

const CATEGORY_LABEL: Record<string, string> = {
  food: "美食", fashion: "穿搭", tech: "科技",
  travel: "旅行", beauty: "美妆", fitness: "健身",
  lifestyle: "生活", home: "家居",
};

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
  const [preScoreData, setPreScoreData] = useState<PreScoreResult | null>(null);
  const [streamMsg, setStreamMsg] = useState<string>("");
  const apiDone = useRef(false);
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
              setStreamMsg(event.data.message);
              if (event.data.step === "agents_start") setStep(4);
              if (event.data.step === "agents_done") setStep(9);
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
        if (prev >= STEPS.length - 1) return prev;
        if (!apiDone.current && prev >= STEPS.length - 2) return prev;
        return prev + 1;
      });
    }, 3500);

    const tipTimer = setInterval(() => setTipIdx((p) => (p + 1) % tips.length), 4500);
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
          maxWidth: 880, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 },
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: { xs: 1.5, md: 2 },
          minHeight: "100vh", alignContent: "start",
        }}
      >
        {/* ── Model A Pre-Score Card (instant) ── */}
        <AnimatePresence>
          {preScoreData && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ gridColumn: "1 / -1" }}
            >
              <Box sx={{
                bgcolor: "#fff", border: "1px solid #e8f5e9", borderRadius: "16px",
                p: { xs: 2, md: 2.5 }, display: "flex", gap: { xs: 2, md: 3 }, alignItems: "center",
                flexWrap: { xs: "wrap", md: "nowrap" },
                background: "linear-gradient(135deg, #f0fdf4 0%, #fff 100%)",
              }}>
                {/* Score ring */}
                <Box sx={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <ScoreRing score={preScoreData.total_score} size={76} />
                  <Typography sx={{ fontSize: 11, color: "#10b981", fontWeight: 600, mt: 0.5 }}>
                    数据预评分
                  </Typography>
                </Box>

                {/* Dimension bars */}
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#262626" }}>
                      {preScoreData.category_cn}品类 · 即时量化分析
                    </Typography>
                    <Box sx={{ px: 0.75, py: 0.125, borderRadius: "6px", bgcolor: preScoreData.total_score >= 85 ? "#dcfce7" : preScoreData.total_score >= 70 ? "#fef3c7" : "#fee2e2" }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: preScoreData.total_score >= 85 ? "#16a34a" : preScoreData.total_score >= 70 ? "#d97706" : "#dc2626" }}>
                        {preScoreData.level}
                      </Typography>
                    </Box>
                  </Box>

                  {Object.entries(preScoreData.dimensions).map(([key, val]) => (
                    <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.4 }}>
                      <Typography sx={{ fontSize: 11, color: "#999", minWidth: 55, textAlign: "right" }}>
                        {DIM_LABELS[key] || key}
                      </Typography>
                      <Box sx={{ flex: 1, height: 6, bgcolor: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${val}%` }}
                          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                          style={{
                            height: "100%", borderRadius: 3,
                            background: DIM_COLORS[key] || "#10b981",
                          }}
                        />
                      </Box>
                      <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#666", minWidth: 28, textAlign: "right" }}>
                        {Math.round(val)}
                      </Typography>
                    </Box>
                  ))}

                  <Typography sx={{ fontSize: 10, color: "#bbb", mt: 0.5 }}>
                    基线 · 平均互动 {preScoreData.baseline.avg_engagement.toLocaleString()} · 爆款线 {preScoreData.baseline.viral_threshold.toLocaleString()} · {preScoreData.baseline.sample_size} 条数据
                  </Typography>
                </Box>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Left: Note preview ── */}
        <Box sx={{ bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "16px", p: { xs: 2, md: 2.5 }, alignSelf: "start" }}>
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

          <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid #f5f5f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography sx={{ fontSize: 12, color: "#ccc" }}>已用时 {elapsed}s</Typography>
            <Typography sx={{ fontSize: 12, color: "#ccc" }}>
              {streamMsg || "预计 30-60s"}
            </Typography>
          </Box>
        </Box>

        {/* ── Right: Progress timeline ── */}
        <Box sx={{ bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "16px", p: { xs: 2, md: 2.5 }, alignSelf: "start" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#999", mb: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            诊断进度
          </Typography>

          <Box sx={{ mb: 2 }}>
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <Box key={i} sx={{ display: "flex", gap: 1.25, mb: i < STEPS.length - 1 ? 0.75 : 0, alignItems: "flex-start" }}>
                  <Box sx={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", mt: 0.125 }}>
                    {done ? (
                      <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: i === 0 ? "#10b981" : "#16a34a" }} />
                    ) : active ? (
                      <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.5, repeat: Infinity }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: i === 0 ? "#10b981" : "#ff2442" }} />
                      </motion.div>
                    ) : (
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#e0e0e0" }} />
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      color: done ? (i === 0 ? "#10b981" : "#16a34a") : active ? "#262626" : "#ccc",
                      lineHeight: 1.4, transition: "color 0.3s",
                    }}>
                      {s.label}
                      {i === 0 && done && preScoreData ? ` · ${Math.round(preScoreData.total_score)}分` : ""}
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

          <Box sx={{ height: 4, bgcolor: "#f0f0f0", borderRadius: 2, overflow: "hidden", mb: 1 }}>
            <Box sx={{
              height: "100%", borderRadius: 2,
              background: "linear-gradient(90deg, #10b981, #ff2442)",
              width: `${progress}%`,
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            }} />
          </Box>
          <Typography sx={{ fontSize: 12, color: "#bbb", textAlign: "right" }}>
            {Math.round(progress)}%
          </Typography>
        </Box>

        {/* ── Bottom: Tips ── */}
        <Box
          sx={{
            gridColumn: { xs: "1", md: "1 / -1" },
            bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "12px",
            px: { xs: 2, md: 2.5 }, py: 1.5,
            display: "flex", alignItems: "center", gap: 1.5, minHeight: 44,
          }}
        >
          <Box sx={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#10b981" strokeWidth="1.5" fill="none" />
              <text x="8" y="11.5" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">i</text>
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
                📊 {tips[tipIdx]}
              </Typography>
            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>
    </Box>
  );
}
