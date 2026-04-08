import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Alert, Stack, IconButton, Tooltip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReplayIcon from "@mui/icons-material/Replay";
import { motion } from "framer-motion";
import type { DiagnoseResult } from "../utils/api";
import { saveHistory } from "../utils/api";
import ScoreCard from "../components/ScoreCard";
import DimensionBars from "../components/DimensionBars";
import RadarChart from "../components/RadarChart";
import BaselineComparison from "../components/BaselineComparison";
import AgentDebate from "../components/AgentDebate";
import SimulatedComments from "../components/SimulatedComments";
import SuggestionList from "../components/SuggestionList";
import DiagnoseCard from "../components/DiagnoseCard";
import { showToast } from "../components/Toast";

const card = {
  bgcolor: "#fff",
  border: "1px solid #f0f0f0",
  borderRadius: "16px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
  p: { xs: 2.5, md: 3 },
};

function saveToLocalHistory(title: string, score: number, grade: string, category: string, report: DiagnoseResult, params: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem("noterx_history");
    const history = raw ? JSON.parse(raw) : [];
    // 去重：同标题只保留最新
    const filtered = history.filter((h: { title: string }) => h.title !== title);
    filtered.unshift({ title, score: Math.round(score), grade, category, date: Date.now(), report, params });
    localStorage.setItem("noterx_history", JSON.stringify(filtered.slice(0, 10)));
  } catch { /* ignore */ }
}

async function saveToServer(title: string, category: string, report: DiagnoseResult) {
  try {
    await saveHistory({ title, category, report });
  } catch { /* server history is best-effort */ }
}

export default function Report() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    report: DiagnoseResult;
    params: { title: string; category: string; content?: string; tags?: string };
    isFallback?: boolean;
  } | null;

  useEffect(() => {
    document.title = `诊断报告 - 薯医 NoteRx`;
    if (state && !state.isFallback) {
      saveToLocalHistory(state.params.title, state.report.overall_score, state.report.grade, state.params.category, state.report, state.params as Record<string, unknown>);
      saveToServer(state.params.title, state.params.category, state.report);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ color: "#999", fontSize: 14, mb: 2 }}>暂无诊断数据</Typography>
          <Button onClick={() => navigate("/")} sx={{ color: "#ff2442", fontWeight: 600 }}>返回首页</Button>
        </Box>
      </Box>
    );
  }

  const { report, params, isFallback } = state;
  const userTags = typeof params.tags === "string"
    ? params.tags.split(",").filter(Boolean)
    : Array.isArray(params.tags) ? params.tags : [];

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label}已复制`);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", pb: 6 }}>
      {/* Top bar */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 50, bgcolor: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <Box sx={{ maxWidth: 960, mx: "auto", px: { xs: 2, md: 3 }, py: 1.25, display: "flex", alignItems: "center" }}>
          <Button
            startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate("/")}
            sx={{ color: "#999", fontWeight: 500, fontSize: 13, "&:hover": { color: "#262626" } }}
          >
            首页
          </Button>
          <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626" }}>诊断报告</Typography>
          <Button
            startIcon={<ReplayIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate("/diagnosing", { state: params })}
            sx={{ color: "#999", fontWeight: 500, fontSize: 13, "&:hover": { color: "#262626" } }}
          >
            再次诊断
          </Button>
        </Box>
      </Box>

      {isFallback && (
        <Box sx={{ maxWidth: 960, mx: "auto", px: { xs: 2, md: 3 }, mt: 2 }}>
          <Alert severity="warning" sx={{ borderRadius: "12px" }}>当前展示的是演示数据</Alert>
        </Box>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
        <Box sx={{ maxWidth: 960, mx: "auto", px: { xs: 2, md: 3 }, mt: 2.5 }}>

          {/* Row 1: Score + Dimension Bars + Radar — 3 columns on desktop */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2, mb: 2 }}>
            <Box sx={card}>
              <ScoreCard score={report.overall_score} grade={report.grade} title={params.title} />
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 2 }}>维度评分</Typography>
              <DimensionBars data={report.radar_data} />
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 1 }}>五维雷达</Typography>
              <RadarChart data={report.radar_data} />
            </Box>
          </Box>

          {/* Row 2: Baseline comparison + Suggestions side by side */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" }, gap: 2, mb: 2 }}>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 2 }}>基线对比</Typography>
              <BaselineComparison category={params.category} userTitle={params.title} userTags={userTags} />
              <Typography sx={{ fontSize: 11, color: "#ccc", mt: 2 }}>
                与该垂类历史数据对比
              </Typography>
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 2 }}>优化建议</Typography>
              <SuggestionList suggestions={report.suggestions} />
            </Box>
          </Box>

          {/* Row 3: Optimized content */}
          {(report.optimized_title || report.optimized_content || report.cover_direction) && (
            <Box sx={{ ...card, mb: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626" }}>AI 优化方案</Typography>
                {report.optimized_title && report.optimized_content && (
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                    onClick={() => {
                      const all = `标题：${report.optimized_title}\n\n${report.optimized_content}`;
                      navigator.clipboard.writeText(all);
                      showToast("已复制标题和正文");
                    }}
                    sx={{ color: "#999", fontSize: 12, "&:hover": { color: "#262626" } }}
                  >
                    复制全部
                  </Button>
                )}
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
                {report.optimized_title && (
                  <Box sx={{ p: 2, borderRadius: "12px", bgcolor: "#fafafa", border: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#ff2442", mb: 0.5 }}>建议标题</Typography>
                      <Typography sx={{ fontSize: 14, color: "#262626", lineHeight: 1.6 }}>{report.optimized_title}</Typography>
                    </Box>
                    <Tooltip title="复制">
                      <IconButton size="small" onClick={() => copyText(report.optimized_title || "", "标题")} sx={{ color: "#ccc", flexShrink: 0 }}>
                        <ContentCopyIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
                {report.optimized_content && (
                  <Box sx={{ p: 2, borderRadius: "12px", bgcolor: "#fafafa", border: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#2563eb", mb: 0.5 }}>优化正文</Typography>
                      <Typography sx={{ fontSize: 13, color: "#505050", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{report.optimized_content}</Typography>
                    </Box>
                    <Tooltip title="复制">
                      <IconButton size="small" onClick={() => copyText(report.optimized_content || "", "正文")} sx={{ color: "#ccc", flexShrink: 0 }}>
                        <ContentCopyIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
              {report.cover_direction && (
                <Box sx={{ mt: 1.5, p: 2, borderRadius: "12px", bgcolor: "#fafafa", border: "1px solid #f0f0f0" }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#999", mb: 1 }}>封面方向</Typography>
                  <Stack spacing={0.5}>
                    {report.cover_direction.layout && <Typography sx={{ fontSize: 13, color: "#505050" }}><strong>构图：</strong>{report.cover_direction.layout}</Typography>}
                    {report.cover_direction.color_scheme && <Typography sx={{ fontSize: 13, color: "#505050" }}><strong>配色：</strong>{report.cover_direction.color_scheme}</Typography>}
                    {report.cover_direction.text_style && <Typography sx={{ fontSize: 13, color: "#505050" }}><strong>文字：</strong>{report.cover_direction.text_style}</Typography>}
                    {report.cover_direction.tips?.map((tip: string, i: number) => (
                      <Typography key={i} sx={{ fontSize: 13, color: "#505050" }}>· {tip}</Typography>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )}

          {/* Row 4: Agent debate + Comments */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" }, gap: 2, mb: 2 }}>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 2 }}>Agent 诊断详情</Typography>
              <AgentDebate opinions={report.agent_opinions} summary={report.debate_summary} timeline={report.debate_timeline} />
            </Box>
            <Box sx={card}>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 2 }}>模拟评论区</Typography>
              <SimulatedComments
                comments={report.simulated_comments}
                noteTitle={params.title}
                noteContent={params.content || ""}
                noteCategory={params.category}
              />
            </Box>
          </Box>

          {/* Row 5: Export */}
          <Box sx={card}>
            <DiagnoseCard report={report} title={params.title} />
          </Box>

          <Typography sx={{ textAlign: "center", fontSize: 12, color: "#ccc", mt: 3 }}>
            本报告由 AI 多 Agent 协作生成，仅供参考
          </Typography>
        </Box>
      </motion.div>
    </Box>
  );
}
