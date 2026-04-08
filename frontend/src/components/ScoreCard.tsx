import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

interface Props {
  score: number;
  grade: string;
  title: string;
}

const GRADE_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  S: { bg: "#fff7ed", color: "#ea580c", label: "爆款潜力" },
  A: { bg: "#f0fdf4", color: "#16a34a", label: "表现优秀" },
  B: { bg: "#eff6ff", color: "#2563eb", label: "中规中矩" },
  C: { bg: "#fef3c7", color: "#d97706", label: "需要优化" },
  D: { bg: "#fef2f2", color: "#dc2626", label: "问题严重" },
};

export default function ScoreCard({ score, grade, title }: Props) {
  const config = GRADE_CONFIG[grade] || GRADE_CONFIG.B;
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const target = Math.round(score);
    if (target <= 0) { setDisplay(target); return; }

    const duration = 1200;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 2.5, gap: 1 }}>
      <Typography
        sx={{
          fontSize: { xs: 52, md: 64 },
          fontWeight: 800,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          background: `linear-gradient(135deg, ${config.color} 0%, #262626 100%)`,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {display}
      </Typography>

      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
        <Box sx={{
          px: 1.5, py: 0.4, borderRadius: "10px", bgcolor: config.bg,
          boxShadow: `0 0 12px ${config.color}18`,
        }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: config.color, letterSpacing: "0.02em" }}>
            {grade}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: "#888", fontWeight: 500 }}>
          {config.label}
        </Typography>
      </Box>

      <Typography
        sx={{
          fontSize: 13, color: "#bbb", mt: 0.25,
          maxWidth: 360, textAlign: "center",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {title}
      </Typography>
    </Box>
  );
}
