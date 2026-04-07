import { useLocation, useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Card, CardContent, Alert, Stack, IconButton, Tooltip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import type { DiagnoseResult } from "../utils/api";
import ScoreCard from "../components/ScoreCard";
import RadarChart from "../components/RadarChart";
import AgentDebate from "../components/AgentDebate";
import SimulatedComments from "../components/SimulatedComments";
import SuggestionList from "../components/SuggestionList";
import DiagnoseCard from "../components/DiagnoseCard";
import { showToast } from "../components/Toast";

const DISCLAIMER = "本报告由 AI 多 Agent 协作生成，诊断结果仅供参考，不构成任何运营承诺。";

/**
 * 诊断报告页
 */
export default function Report() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    report: DiagnoseResult;
    params: { title: string; category: string };
    isFallback?: boolean;
  } | null;

  if (!state) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography color="text.secondary" gutterBottom>暂无诊断数据</Typography>
          <Button variant="text" onClick={() => navigate("/")}>返回首页</Button>
        </Box>
      </Box>
    );
  }

  const { report, params, isFallback } = state;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label}已复制`);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #ecfdf5 0%, #ffffff 50%, #f0fdfa 100%)",
        pb: 10,
      }}
    >
      {/* 顶栏 */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/")} size="small" color="inherit">
            重新诊断
          </Button>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography sx={{ fontSize: 20 }}>💊</Typography>
            <Typography sx={{ fontWeight: 700 }} color="primary">诊断报告</Typography>
          </Box>
          <Box sx={{ width: 90 }} />
        </Box>
      </Box>

      {isFallback && (
        <Box sx={{ maxWidth: 720, mx: "auto", px: 2, mt: 2 }}>
          <Alert severity="warning">当前展示的是演示数据（后端不可用）</Alert>
        </Box>
      )}

      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, mt: 3 }}>
        <Stack spacing={3}>
          {/* 评分卡 */}
          <ScoreCard score={report.overall_score} grade={report.grade} title={params.title} />

          {/* 雷达图 */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
                📊 五维诊断雷达图
              </Typography>
              <RadarChart data={report.radar_data} />
            </CardContent>
          </Card>

          {/* 建议 + 优化 */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
                💡 优化建议
              </Typography>
              <SuggestionList suggestions={report.suggestions} />

              {report.optimized_title && (
                <Alert
                  severity="success"
                  icon={false}
                  sx={{ mt: 2 }}
                  action={
                    <Tooltip title="复制标题">
                      <IconButton size="small" onClick={() => copyText(report.optimized_title || "", "标题")}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <Typography variant="subtitle2">AI 建议标题：</Typography>
                  <Typography variant="body2">「{report.optimized_title}」</Typography>
                </Alert>
              )}

              {report.optimized_content && (
                <Alert
                  severity="info"
                  icon={false}
                  sx={{ mt: 1.5 }}
                  action={
                    <Tooltip title="复制正文">
                      <IconButton size="small" onClick={() => copyText(report.optimized_content || "", "正文")}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <Typography variant="subtitle2">AI 优化正文：</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                    {report.optimized_content}
                  </Typography>
                </Alert>
              )}

              {report.cover_direction && (
                <Box sx={{ mt: 2, p: 2, bgcolor: "#faf5ff", borderRadius: 2 }}>
                  <Typography variant="subtitle2" color="secondary" gutterBottom>
                    🎨 封面方向建议
                  </Typography>
                  <Stack spacing={0.5}>
                    {report.cover_direction.layout && (
                      <Typography variant="body2">构图：{report.cover_direction.layout}</Typography>
                    )}
                    {report.cover_direction.color_scheme && (
                      <Typography variant="body2">配色：{report.cover_direction.color_scheme}</Typography>
                    )}
                    {report.cover_direction.text_style && (
                      <Typography variant="body2">文字：{report.cover_direction.text_style}</Typography>
                    )}
                    {report.cover_direction.tips?.length > 0 &&
                      report.cover_direction.tips.map((tip: string, i: number) => (
                        <Typography key={i} variant="body2" sx={{ display: "flex", gap: 0.5, alignItems: "flex-start" }}>
                          <span style={{ color: "#8b5cf6" }}>✦</span> {tip}
                        </Typography>
                      ))}
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Agent 辩论 */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
                🤖 多Agent诊断详情
              </Typography>
              <AgentDebate
                opinions={report.agent_opinions}
                summary={report.debate_summary}
                timeline={report.debate_timeline}
              />
            </CardContent>
          </Card>

          {/* 模拟评论 */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
                💬 AI模拟评论区
              </Typography>
              <SimulatedComments comments={report.simulated_comments} />
            </CardContent>
          </Card>

          {/* 导出 */}
          <DiagnoseCard report={report} title={params.title} />

          {/* 免责 */}
          <Typography component="p" variant="caption" color="text.disabled" sx={{ textAlign: "center", pt: 2, pb: 4 }}>
            {DISCLAIMER}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
