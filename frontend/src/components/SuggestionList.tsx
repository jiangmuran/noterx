import { Box, Typography, Chip, Stack } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";

interface Suggestion {
  priority: number;
  description: string;
  expected_impact: string;
}

interface Props {
  suggestions: Suggestion[];
}

const PRIORITY_LABELS: { label: string; color: "error" | "warning" | "info" }[] = [
  { label: "最优先", color: "error" },
  { label: "重要", color: "warning" },
  { label: "建议", color: "info" },
];

/**
 * 优化建议列表
 */
export default function SuggestionList({ suggestions }: Props) {
  if (!suggestions.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        暂无优化建议
      </Typography>
    );
  }

  const sorted = [...suggestions].sort((a, b) => a.priority - b.priority);

  return (
    <Stack spacing={2}>
      {sorted.map((s, i) => {
        const badge = PRIORITY_LABELS[Math.min(i, PRIORITY_LABELS.length - 1)];
        return (
          <Box
            key={i}
            sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, p: 2, bgcolor: "grey.50", borderRadius: 2 }}
          >
            <Chip label={badge.label} color={badge.color} size="small" sx={{ fontWeight: 600 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">{s.description}</Typography>
              {s.expected_impact && (
                <Typography variant="caption" color="primary" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TrendingUpIcon sx={{ fontSize: 14 }} />
                  {s.expected_impact}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
