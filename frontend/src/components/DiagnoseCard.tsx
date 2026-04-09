import { useRef, useState } from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import ShareIcon from "@mui/icons-material/Share";
import html2canvas from "html2canvas";
import type { DiagnoseResult } from "../utils/api";

interface Props {
  report: DiagnoseResult;
  title: string;
}

export default function DiagnoseCard({ report, title }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: 360,
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

  const gradeColor: Record<string, string> = {
    S: "#ea580c", A: "#16a34a", B: "#2563eb", C: "#d97706", D: "#dc2626",
  };

  return (
    <Box>
      <Button
        variant="outlined" fullWidth
        startIcon={<ShareIcon />}
        disabled={exporting}
        onClick={handleExport}
        sx={{
          py: 1.25, borderRadius: "12px", fontWeight: 700, fontSize: 14,
          color: "#262626", borderColor: "#e0e0e0",
          "&:hover": { borderColor: "#262626", bgcolor: "#fafafa" },
        }}
      >
        {exporting ? "生成中..." : "分享诊断卡片"}
      </Button>

      <Box
        ref={cardRef}
        sx={{
          mt: 2, border: "1px solid #f0f0f0", borderRadius: "16px",
          overflow: "hidden", bgcolor: "#fff",
          width: 360, mx: "auto",
        }}
      >
        {/* Header gradient */}
        <Box sx={{
          background: "linear-gradient(135deg, #ff3d5c, #e61e3d)",
          px: 3, pt: 2.5, pb: 2, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 600, opacity: 0.8, mb: 0.25 }}>薯医诊断</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
              {title}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>
              {Math.round(report.overall_score)}
            </Typography>
            <Typography sx={{
              fontSize: 12, fontWeight: 700,
              bgcolor: "rgba(255,255,255,0.2)", px: 1, py: 0.15,
              borderRadius: "6px", mt: 0.25,
            }}>
              {report.grade}
            </Typography>
          </Box>
        </Box>

        {/* Radar data bars */}
        <Box sx={{ px: 3, py: 2 }}>
          {Object.entries(report.radar_data || {}).map(([key, val]) => {
            const labels: Record<string, string> = {
              content: "内容", visual: "视觉", growth: "增长",
              user_reaction: "互动", overall: "综合",
            };
            return (
              <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                <Typography sx={{ fontSize: 10, color: "#999", width: 28, textAlign: "right" }}>
                  {labels[key] || key}
                </Typography>
                <Box sx={{ flex: 1, height: 4, bgcolor: "#f5f5f5", borderRadius: 2, overflow: "hidden" }}>
                  <Box sx={{ height: "100%", bgcolor: "#ff2442", borderRadius: 2, width: `${val}%` }} />
                </Box>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#666", width: 20, textAlign: "right" }}>
                  {Math.round(val as number)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Issues */}
        <Box sx={{ px: 3, py: 1.5, borderTop: "1px solid #f0f0f0" }}>
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#999", mb: 0.75 }}>主要发现</Typography>
          <Stack spacing={0.3}>
            {report.issues.slice(0, 3).map((issue, i) => (
              <Typography key={i} sx={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>
                {i + 1}. {typeof issue === "string" ? issue : issue.description}
              </Typography>
            ))}
          </Stack>
        </Box>

        {/* Footer with branding */}
        <Box sx={{
          px: 3, py: 1.5, bgcolor: "#fafafa", borderTop: "1px solid #f0f0f0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{
              width: 16, height: 16, borderRadius: "4px",
              background: "linear-gradient(135deg, #ff5c6f, #e61e3d)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Typography sx={{ color: "#fff", fontSize: 7, fontWeight: 800 }}>Rx</Typography>
            </Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#262626" }}>薯医 NoteRx</Typography>
          </Box>
          <Typography sx={{ fontSize: 9, color: "#bbb" }}>noterx.muran.tech</Typography>
        </Box>
      </Box>
    </Box>
  );
}
