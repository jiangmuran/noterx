import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { diagnoseNote, diagnoseStream, getErrorMessage, preScore } from "../utils/api";
import type { PreScoreResult, StreamEvent } from "../utils/api";

const STEPS = [
  "初始化评分",
  "解析标题和正文",
  "分析封面素材",
  "对比垂类基线",
  "内容诊断",
  "视觉诊断",
  "增长诊断",
  "用户反馈模拟",
  "专家交叉评审",
  "生成最终报告",
];

const EVENT_STEP_MAP: Record<string, number> = {
  parse_start: 1,
  parse_done: 2,
  baseline_start: 3,
  baseline_done: 4,
  round1_start: 4,
  round1_content_done: 5,
  round1_visual_done: 6,
  round1_growth_done: 7,
  round1_user_done: 8,
  round1_done: 8,
  debate_start: 9,
  judge_done: 10,
  finalizing: 10,
};

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
  const [elapsed, setElapsed] = useState(0);
  const [statusMessage, setStatusMessage] = useState("正在准备诊断...");
  const [preScoreData, setPreScoreData] = useState<PreScoreResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "诊断中 - 钖尰 NoteRx";
    if (!params) navigate("/app");
  }, [navigate, params]);

  useEffect(() => {
    if (!params) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        const score = await preScore({
          title: params.title,
          content: params.content,
          category: params.category,
          tags: params.tags,
          image_count: params.coverImages?.length ?? (params.coverFile ? 1 : 0),
        });
        if (!cancelled) {
          setPreScoreData(score);
          setStep(1);
        }
      } catch {
        // Pre-score is an enhancement only.
      }

      timeoutId = setTimeout(() => {
        if (!cancelled) {
          setFatalError("诊断超时，请重试。");
        }
      }, 90000);

      try {
        await diagnoseStream(
          {
            title: params.title,
            content: params.content,
            category: params.category,
            tags: params.tags,
            coverImage: params.coverFile ?? undefined,
            coverImages: params.coverImages,
            videoFile: params.videoFile ?? undefined,
          },
          (event: StreamEvent) => {
            if (cancelled) return;

            if (event.type === "pre_score") {
              setPreScoreData(event.data as unknown as PreScoreResult);
              setStep((prev) => Math.max(prev, 1));
              return;
            }

            if (event.type === "progress") {
              setStatusMessage(event.data.message);
              const mappedStep = EVENT_STEP_MAP[event.data.step];
              if (mappedStep !== undefined) {
                setStep((prev) => Math.max(prev, mappedStep));
              }
              return;
            }

            if (event.type === "error") {
              setFatalError(event.data.message || "诊断失败，请重试。");
              return;
            }

            if (event.type === "result") {
              setStep(STEPS.length);
              navigate("/report", { state: { report: event.data, params, isFallback: false } });
            }
          },
        );
      } catch (streamError) {
        try {
          const result = await diagnoseNote({
            title: params.title,
            content: params.content,
            category: params.category,
            tags: params.tags,
            coverImage: params.coverFile ?? undefined,
            coverImages: params.coverImages,
            videoFile: params.videoFile ?? undefined,
          });

          if (!cancelled) {
            setStep(STEPS.length);
            navigate("/report", { state: { report: result, params, isFallback: false } });
          }
        } catch (noteError) {
          if (!cancelled) {
            setFatalError(getErrorMessage(noteError, getErrorMessage(streamError, "诊断失败，请重试。")));
          }
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    void run();

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate, params]);

  const progress = useMemo(() => Math.min(((step || 1) / STEPS.length) * 100, 100), [step]);

  if (!params) return null;

  if (fatalError) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", px: 2 }}>
        <Box sx={{ width: "100%", maxWidth: 520, bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "18px", p: 3 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 800, color: "#262626", mb: 1.5 }}>诊断中断</Typography>
          <Alert severity="error" sx={{ borderRadius: "12px", mb: 2 }}>
            {fatalError}
          </Alert>
          <Box sx={{ display: "flex", gap: 1.5, flexDirection: isDesktop ? "row" : "column" }}>
            <Button variant="contained" onClick={() => navigate("/app")} sx={{ flex: 1, background: "#ff2442", "&:hover": { background: "#e61e3d" } }}>
              返回重试
            </Button>
            <Button variant="outlined" onClick={() => navigate("/history")} sx={{ flex: 1 }}>
              查看历史
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fff", display: "flex", flexDirection: "column" }}>
      <Box sx={{ borderBottom: "1px solid #f0f0f0", px: { xs: 2, md: 3 }, py: 1.5 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800, color: "#262626" }}>正在诊断</Typography>
        <Typography sx={{ fontSize: 12, color: "#999", mt: 0.5 }}>{params.title || "未命名笔记"}</Typography>
      </Box>

      <Box sx={{ width: "100%", maxWidth: 900, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 }, display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: 3 }}>
        <Box sx={{ bgcolor: "#fafafa", borderRadius: "18px", border: "1px solid #f0f0f0", p: 2.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1.5 }}>
          {preScoreData ? (
            <>
              <Typography sx={{ fontSize: 40, fontWeight: 900, color: preScoreData.total_score >= 75 ? "#16a34a" : "#f59e0b" }}>
                {Math.round(preScoreData.total_score)}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "#666", fontWeight: 700 }}>{preScoreData.category_cn}</Typography>
              <Typography sx={{ fontSize: 12, color: "#999", textAlign: "center" }}>{preScoreData.level}</Typography>
            </>
          ) : (
            <>
              <CircularProgress size={40} sx={{ color: "#ff2442" }} />
              <Typography sx={{ fontSize: 12, color: "#999" }}>正在初始化评分...</Typography>
            </>
          )}
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ bgcolor: "#fafafa", borderRadius: "18px", border: "1px solid #f0f0f0", p: 2.5 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: "#262626", mb: 1 }}>{STEPS[Math.max(step - 1, 0)]}</Typography>
            <Typography sx={{ fontSize: 13, color: "#666", mb: 2 }}>{statusMessage}</Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 8,
                borderRadius: 999,
                bgcolor: "#f1f5f9",
                "& .MuiLinearProgress-bar": { borderRadius: 999, backgroundColor: "#ff2442" },
              }}
            />
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
              <Typography sx={{ fontSize: 11, color: "#999" }}>
                {Math.min(step || 1, STEPS.length)} / {STEPS.length}
              </Typography>
              <Typography sx={{ fontSize: 11, color: "#999" }}>{elapsed}s</Typography>
            </Box>
          </Box>

          <Box sx={{ bgcolor: "#fafafa", borderRadius: "18px", border: "1px solid #f0f0f0", p: 2.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#262626", mb: 1.5 }}>处理步骤</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {STEPS.map((label, index) => {
                const done = index < step - 1;
                const active = index === Math.max(step - 1, 0);

                return (
                  <Box
                    key={label}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 1.25,
                      py: 0.9,
                      borderRadius: "12px",
                      bgcolor: done ? "#f0fdf4" : active ? "#fff1f2" : "#fff",
                      border: "1px solid",
                      borderColor: done ? "#bbf7d0" : active ? "#fecdd3" : "#e5e7eb",
                    }}
                  >
                    {done ? (
                      <Box sx={{ width: 10, height: 10, borderRadius: "999px", bgcolor: "#16a34a" }} />
                    ) : active ? (
                      <CircularProgress size={12} thickness={6} sx={{ color: "#ff2442" }} />
                    ) : (
                      <Box sx={{ width: 10, height: 10, borderRadius: "999px", bgcolor: "#d1d5db" }} />
                    )}
                    <Typography sx={{ fontSize: 12, fontWeight: active || done ? 700 : 500, color: done ? "#166534" : active ? "#be123c" : "#6b7280" }}>
                      {label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
