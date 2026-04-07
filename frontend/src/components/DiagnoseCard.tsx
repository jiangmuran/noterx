import { useRef, useState } from "react";
import { Box, Typography, Button, LinearProgress, Stack } from "@mui/material";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import html2canvas from "html2canvas";
import type { DiagnoseResult } from "../utils/api";

interface Props {
  report: DiagnoseResult;
  title: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  content: "内容质量",
  visual: "视觉表现",
  growth: "增长策略",
  user_reaction: "用户反应",
  overall: "综合",
};

/**
 * 可导出的诊断卡片
 */
export default function DiagnoseCard({ report, title }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `薯医诊断-${title.slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("导出失败", err);
    } finally {
      setExporting(false);
    }
  };

  const gradeColor = report.grade === "S" || report.grade === "A" ? "#10b981" : report.grade === "B" ? "#3b82f6" : "#ef4444";

  return (
    <Box>
      <Button
        variant="contained"
        fullWidth
        startIcon={<FileDownloadIcon />}
        disabled={exporting}
        onClick={handleExport}
        size="large"
      >
        {exporting ? "导出中..." : "导出诊断卡片"}
      </Button>

      {/* 导出区域 */}
      <Box ref={cardRef} sx={{ mt: 2, bgcolor: "#fff", borderRadius: 4, overflow: "hidden", width: 375, border: "1px solid #e5e7eb" }}>
        {/* 头部 */}
        <Box sx={{ background: "linear-gradient(135deg, #10b981, #14b8a6)", px: 2.5, py: 2, color: "#fff" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Typography fontSize={20}>💊</Typography>
            <Typography fontWeight={700}>薯医 NoteRx 诊断报告</Typography>
          </Box>
          <Typography variant="body2" sx={{ opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            「{title}」
          </Typography>
        </Box>

        {/* 分数 */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 2.5, py: 2, borderBottom: "1px solid #f3f4f6" }}>
          <Box>
            <Typography variant="caption" color="text.secondary">综合评分</Typography>
            <Typography variant="h4" fontWeight={800}>{Math.round(report.overall_score)}</Typography>
          </Box>
          <Typography variant="h3" fontWeight={800} sx={{ color: gradeColor }}>
            {report.grade}
          </Typography>
        </Box>

        {/* 维度条 */}
        <Stack spacing={1} sx={{ px: 2.5, py: 1.5 }}>
          {Object.entries(report.radar_data).map(([key, val]) => (
            <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 55, flexShrink: 0 }}>
                {DIMENSION_LABELS[key] || key}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={val}
                sx={{
                  flex: 1, height: 6, borderRadius: 3, bgcolor: "#f3f4f6",
                  "& .MuiLinearProgress-bar": { bgcolor: "#10b981", borderRadius: 3 },
                }}
              />
              <Typography variant="caption" fontWeight={600} sx={{ width: 28, textAlign: "right" }}>
                {Math.round(val)}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* 问题 */}
        <Box sx={{ px: 2.5, py: 1.5, borderTop: "1px solid #f3f4f6" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} gutterBottom>
            主要问题
          </Typography>
          {report.issues.slice(0, 3).map((issue, i) => (
            <Typography key={i} variant="caption" display="block" color="text.secondary">
              {i + 1}. {typeof issue === "string" ? issue : issue.description}
            </Typography>
          ))}
        </Box>

        {/* 底部 */}
        <Box sx={{ px: 2.5, py: 1.5, bgcolor: "#f9fafb", textAlign: "center" }}>
          <Typography variant="caption" color="text.disabled">
            薯医 NoteRx — 你的笔记，值得被看见。
          </Typography>
          <Typography variant="caption" display="block" color="text.disabled" sx={{ fontSize: "0.65rem", mt: 0.5 }}>
            AI 诊断仅供参考，不构成运营承诺
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
