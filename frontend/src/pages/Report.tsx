import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Alert, Stack, IconButton, Tooltip,
  Skeleton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReplayIcon from "@mui/icons-material/Replay";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { motion } from "framer-motion";
import type { DiagnoseResult, PreScoreResult, OptimizePlan } from "../utils/api";
import { saveHistory, preScore, optimizeDiagnosis } from "../utils/api";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import StarIcon from "@mui/icons-material/Star";
import CircularProgress from "@mui/material/CircularProgress";
import {
  migrateLegacyLocalStorage,
  createPendingId,
  putLocalDiagnosis,
  replacePendingWithServerId,
} from "../utils/localMemory";
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
  borderRadius: "18px",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  p: { xs: 2.5, md: 3 },
};

const sectionGap = 2.5;

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
    if (!state || state.isFallback) return;
    const { report, params } = state;
    void (async () => {
      await migrateLegacyLocalStorage();
      const pendingId = createPendingId();
      await putLocalDiagnosis({
        id: pendingId,
        serverId: null,
        title: params.title,
        category: params.category,
        overall_score: report.overall_score,
        grade: report.grade,
        createdAt: Date.now(),
        report,
        params: params as Record<string, unknown>,
      });
      try {
        const { id } = await saveHistory({
          title: params.title,
          category: params.category,
          report,
        });
        await replacePendingWithServerId(pendingId, id);
      } catch {
        /* 仅保留本地 IndexedDB（pending id） */
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ color: "#999", fontSize: 14, mb: 2 }}>暂无诊断数据</Typography>
          <Button onClick={() => navigate("/app")} sx={{ color: "#ff2442", fontWeight: 600 }}>返回首页</Button>
        </Box>
      </Box>
    );
  }

  const { report, params, isFallback } = state;
  const userTags = typeof params.tags === "string"
    ? params.tags.split(",").filter(Boolean)
    : Array.isArray(params.tags) ? params.tags : [];

  // Re-score with optimized content
  const [optimizedScore, setOptimizedScore] = useState<PreScoreResult | null>(null);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    if (!report.optimized_title && !report.optimized_content) return;
    setRescoring(true);
    preScore({
      title: report.optimized_title || params.title,
      content: report.optimized_content || params.content || "",
      category: params.category,
      tags: params.tags || "",
      image_count: 0,
    }).then((ps) => {
      setOptimizedScore(ps);
    }).catch(() => {}).finally(() => setRescoring(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Staggered section reveal
  const [visibleSections, setVisibleSections] = useState(0);
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVisibleSections(i);
      if (i >= 6) clearInterval(timer);
    }, 150);
    return () => clearInterval(timer);
  }, []);

  // Optimization engine state
  const [optimizing, setOptimizing] = useState(false);
  const [optimizePlans, setOptimizePlans] = useState<OptimizePlan[]>([]);
  const [showOptPanel, setShowOptPanel] = useState(false);

  const handleOptimize = async () => {
    setOptimizing(true);
    setShowOptPanel(true);
    try {
      const result = await optimizeDiagnosis({
        title: params.title,
        content: params.content || "",
        category: params.category,
        issues: JSON.stringify(report.issues?.slice(0, 5) || []),
        suggestions: JSON.stringify(report.suggestions?.slice(0, 5) || []),
        overall_score: report.overall_score,
      });
      setOptimizePlans(result.plans);
    } catch (e) {
      console.warn("优化失败", e);
    } finally {
      setOptimizing(false);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label}已复制`);
  };

  const sectionAnim = (index: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: visibleSections >= index ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
    transition: { duration: 0.4, ease: "easeOut" as const },
  });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", pb: 6 }}>
      {/* Top bar */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 50, bgcolor: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <Box sx={{ maxWidth: 960, mx: "auto", px: { xs: 2, md: 3 }, py: 1.25, display: "flex", alignItems: "center" }}>
          <Button
            startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate("/app")}
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

      <Box sx={{ maxWidth: 960, mx: "auto", px: { xs: 2, md: 3 }, mt: 2.5 }}>

          {/* Row 1: Score + Dimension + Radar */}
          <motion.div {...sectionAnim(1)}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: sectionGap, mb: sectionGap }}>
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

          </motion.div>

          {/* Row 2: Baseline + Suggestions */}
          <motion.div {...sectionAnim(2)}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" }, gap: sectionGap, mb: sectionGap }}>
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

          </motion.div>

          {/* Row 3: Optimized content + score comparison */}
          <motion.div {...sectionAnim(3)}>
          {(report.optimized_title || report.optimized_content || report.cover_direction) && (
            <Box sx={{ ...card, mb: sectionGap }}>
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
              {/* Score comparison */}
              {(optimizedScore || rescoring) && (
                <Box sx={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 1.5, mb: 2, py: 1.5, px: 2,
                  borderRadius: "12px", bgcolor: "#f0fdf4", border: "1px solid #bbf7d0",
                }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: "#999", mb: 0.25 }}>当前</Typography>
                    <Typography sx={{ fontSize: 22, fontWeight: 800, color: "#666" }}>
                      {Math.round(report.overall_score)}
                    </Typography>
                  </Box>
                  <ArrowForwardIcon sx={{ fontSize: 18, color: "#16a34a" }} />
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: "#16a34a", mb: 0.25, fontWeight: 600 }}>优化后预估</Typography>
                    {rescoring ? (
                      <Skeleton variant="text" width={40} height={32} sx={{ mx: "auto" }} />
                    ) : optimizedScore ? (
                      <Typography sx={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>
                        {Math.round(optimizedScore.total_score)}
                      </Typography>
                    ) : null}
                  </Box>
                  {optimizedScore && (
                    <Box sx={{ px: 1, py: 0.4, borderRadius: "8px", bgcolor: "#dcfce7" }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>
                        +{Math.round(optimizedScore.total_score - report.overall_score)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

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

          </motion.div>

          {/* Row 4: Agent debate + Comments */}
          <motion.div {...sectionAnim(4)}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" }, gap: sectionGap, mb: sectionGap }}>
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

          </motion.div>

          {/* Row 5: Optimization Engine */}
          <motion.div {...sectionAnim(5)}>
          <Box sx={{ ...card, mb: sectionGap }}>
            {!showOptPanel ? (
              <Button
                variant="contained" fullWidth
                startIcon={<AutoFixHighIcon />}
                onClick={handleOptimize}
                sx={{
                  py: 1.5, fontSize: 15, fontWeight: 700, borderRadius: "12px",
                  background: "linear-gradient(135deg, #ff3d5c, #e61e3d)",
                  boxShadow: "0 4px 20px rgba(255,36,66,0.25)",
                  "&:hover": { boxShadow: "0 8px 28px rgba(255,36,66,0.35)", transform: "translateY(-1px)" },
                }}
              >
                继续优化 — AI 生成高分方案
              </Button>
            ) : (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#262626", mb: 2 }}>
                  AI 优化方案
                </Typography>

                {optimizing && (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, py: 4 }}>
                    <CircularProgress size={20} sx={{ color: "#ff2442" }} />
                    <Typography sx={{ fontSize: 14, color: "#666" }}>正在生成优化方案...</Typography>
                  </Box>
                )}

                {optimizePlans.length > 0 && (
                  <Stack spacing={1.5}>
                    {optimizePlans.map((plan, i) => (
                      <Box key={i} sx={{
                        p: 2, borderRadius: "12px",
                        bgcolor: plan.recommended ? "#fff5f6" : "#fafafa",
                        border: plan.recommended ? "1.5px solid #fecaca" : "1px solid #f0f0f0",
                        position: "relative",
                      }}>
                        {plan.recommended && (
                          <Box sx={{
                            position: "absolute", top: -1, right: 12,
                            px: 1, py: 0.25, borderRadius: "0 0 6px 6px",
                            bgcolor: "#ff2442",
                          }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 0.3 }}>
                              <StarIcon sx={{ fontSize: 10 }} /> 推荐
                            </Typography>
                          </Box>
                        )}

                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#262626" }}>
                            {plan.strategy}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                            <Typography sx={{ fontSize: 18, fontWeight: 800, color: plan.score_delta > 0 ? "#16a34a" : "#666" }}>
                              {plan.score}
                            </Typography>
                            {plan.score_delta > 0 && (
                              <Box sx={{ px: 0.5, py: 0.15, borderRadius: "6px", bgcolor: "#dcfce7" }}>
                                <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#16a34a" }}>+{plan.score_delta}</Typography>
                              </Box>
                            )}
                          </Box>
                        </Box>

                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#ff2442", mb: 0.5 }}>
                          {plan.optimized_title}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "#666", lineHeight: 1.6, mb: 1,
                          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {plan.optimized_content}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <Button size="small" onClick={() => copyText(`${plan.optimized_title}\n\n${plan.optimized_content}`, "方案")}
                            startIcon={<ContentCopyIcon sx={{ fontSize: 13 }} />}
                            sx={{ fontSize: 11, color: "#999", "&:hover": { color: "#262626" } }}>
                            复制
                          </Button>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            )}
          </Box>
          </motion.div>

          {/* Row 6: Export */}
          <motion.div {...sectionAnim(5)}>
          <Box sx={card}>
            <DiagnoseCard report={report} title={params.title} />
          </Box>

          </motion.div>

          <motion.div {...sectionAnim(6)}>
          <Typography sx={{ textAlign: "center", fontSize: 12, color: "#ccc", mt: 3 }}>
            本报告由 AI 多 Agent 协作生成，仅供参考
          </Typography>
          </motion.div>
        </Box>
    </Box>
  );
}
