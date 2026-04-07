import { Box, Typography, Stack, Paper } from "@mui/material";
import type { SimulatedComment } from "../utils/api";

interface Props {
  comments: SimulatedComment[];
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#f0fdf4",
  negative: "#fef2f2",
  neutral: "#f9fafb",
};

/**
 * AI 模拟评论区
 */
export default function SimulatedComments({ comments }: Props) {
  if (!comments.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        暂无模拟评论
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="caption" color="text.secondary">
        以下评论由 AI 模拟生成，预测真实用户可能的反应
      </Typography>
      {comments.map((c, i) => (
        <Paper
          key={i}
          variant="outlined"
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
            p: 2,
            bgcolor: SENTIMENT_COLORS[c.sentiment] || SENTIMENT_COLORS.neutral,
          }}
        >
          <Typography fontSize={28} lineHeight={1}>
            {c.avatar_emoji}
          </Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">{c.username}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {c.comment}
            </Typography>
          </Box>
        </Paper>
      ))}
    </Stack>
  );
}
