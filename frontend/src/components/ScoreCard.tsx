import { Box, Typography, Chip } from "@mui/material";

interface Props {
  score: number;
  grade: string;
  title: string;
}

const GRADE_CONFIG: Record<string, { gradient: string; label: string }> = {
  S: { gradient: "linear-gradient(135deg, #f59e0b, #f97316)", label: "爆款潜力" },
  A: { gradient: "linear-gradient(135deg, #10b981, #14b8a6)", label: "表现优秀" },
  B: { gradient: "linear-gradient(135deg, #3b82f6, #6366f1)", label: "中规中矩" },
  C: { gradient: "linear-gradient(135deg, #f97316, #ef4444)", label: "需要优化" },
  D: { gradient: "linear-gradient(135deg, #ef4444, #e11d48)", label: "问题严重" },
};

/**
 * 综合评分卡片
 */
export default function ScoreCard({ score, grade, title }: Props) {
  const config = GRADE_CONFIG[grade] || GRADE_CONFIG.B;

  return (
    <Box
      sx={{
        background: config.gradient,
        borderRadius: 4,
        p: 3,
        color: "#fff",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            诊断笔记
          </Typography>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            「{title}」
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", ml: 2 }}>
          <Typography variant="h2" fontWeight={800} lineHeight={1}>
            {Math.round(score)}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            / 100
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Chip
          label={`${grade} 级`}
          sx={{
            bgcolor: "rgba(255,255,255,0.2)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "1rem",
            backdropFilter: "blur(4px)",
          }}
        />
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {config.label}
        </Typography>
      </Box>
    </Box>
  );
}
