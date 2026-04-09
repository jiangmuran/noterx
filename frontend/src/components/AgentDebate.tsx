import { useState } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { AgentOpinion, DebateEntry } from "../utils/api";

interface Props {
  opinions: AgentOpinion[];
  summary: string;
  timeline?: DebateEntry[];
}

const KIND_STYLE: Record<string, { color: string; border: string; label: string }> = {
  agree: { color: "#16a34a", border: "#bbf7d0", label: "赞同" },
  rebuttal: { color: "#dc2626", border: "#fecaca", label: "反驳" },
  add: { color: "#2563eb", border: "#bfdbfe", label: "补充" },
};

export default function AgentDebate({ opinions, summary, timeline }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  return (
    <Stack spacing={2}>
      {summary && (
        <Box sx={{ bgcolor: "#f5f5f5", borderRadius: "12px", p: 2 }}>
          <Typography sx={{ fontSize: 14, color: "#505050", lineHeight: 1.7 }}>
            {summary}
          </Typography>
        </Box>
      )}

      {opinions.map((op, idx) => {
        const isOpen = expandedIdx === idx;
        const scoreColor = op.score >= 75 ? "#16a34a" : op.score >= 50 ? "#d97706" : "#dc2626";

        return (
          <Box key={idx}>
            <Box
              onClick={() => setExpandedIdx(isOpen ? null : idx)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.5,
                cursor: "pointer",
                borderRadius: isOpen ? "12px 12px 0 0" : "12px",
                border: "1px solid #f0f0f0",
                borderBottom: isOpen ? "1px solid #f0f0f0" : undefined,
                bgcolor: "#fff",
                "&:hover": { bgcolor: "#fafafa" },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14, color: "#262626" }}>
                    {op.agent_name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: "#8e8e8e",
                      bgcolor: "#f5f5f5",
                      px: 1,
                      py: 0.25,
                      borderRadius: "6px",
                    }}
                  >
                    {op.dimension}
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: 16, color: scoreColor }}>
                {Math.round(op.score)}
              </Typography>
              <ExpandMoreIcon
                sx={{
                  color: "#8e8e8e",
                  fontSize: 20,
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            </Box>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: "hidden" }}
                >
                  <Box
                    sx={{
                      p: 2,
                      border: "1px solid #f0f0f0",
                      borderTop: "none",
                      borderRadius: "0 0 12px 12px",
                      bgcolor: "#fff",
                    }}
                  >
                    <Stack spacing={1.5}>
                      {op.issues.length > 0 && (
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#dc2626", mb: 0.5 }}>
                            发现问题
                          </Typography>
                          {op.issues.map((issue, i) => (
                            <Typography key={i} sx={{ fontSize: 13, color: "#505050", lineHeight: 1.6 }}>
                              - {issue}
                            </Typography>
                          ))}
                        </Box>
                      )}
                      {op.suggestions.length > 0 && (
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#ff2442", mb: 0.5 }}>
                            优化建议
                          </Typography>
                          {op.suggestions.map((sug, i) => (
                            <Typography key={i} sx={{ fontSize: 13, color: "#505050", lineHeight: 1.6 }}>
                              - {sug}
                            </Typography>
                          ))}
                        </Box>
                      )}
                      {op.reasoning && (
                        <Box sx={{ borderLeft: "2px solid #f0f0f0", pl: 1.5 }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#8e8e8e", mb: 0.25 }}>
                            分析过程
                          </Typography>
                          <Typography sx={{ fontSize: 13, color: "#505050", lineHeight: 1.7 }}>
                            {op.reasoning}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>
          </Box>
        );
      })}

      {timeline && timeline.length > 0 && (() => {
        const PREVIEW_COUNT = 3;
        const visible = showAllTimeline ? timeline : timeline.slice(0, PREVIEW_COUNT);
        const hasMore = timeline.length > PREVIEW_COUNT;

        return (
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: "#262626", mb: 1.5 }}>
              辩论过程
            </Typography>
            <Stack spacing={1}>
              {visible.map((entry, i) => {
                const kind = KIND_STYLE[entry.kind] || KIND_STYLE.add;
                return (
                  <Box key={i} sx={{ display: "flex", gap: 0.75, alignItems: "flex-start", flexWrap: { xs: "wrap", md: "nowrap" } }}>
                    <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexShrink: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#262626" }}>
                        {entry.agent_name}
                      </Typography>
                      <Box
                        sx={{
                          fontSize: 10, fontWeight: 600, color: kind.color,
                          border: `1px solid ${kind.border}`, borderRadius: "8px",
                          px: 0.75, py: 0.1, lineHeight: 1.5,
                        }}
                      >
                        {kind.label}
                      </Box>
                    </Box>
                    <Typography sx={{ fontSize: 13, color: "#505050", lineHeight: 1.6, flex: 1, minWidth: 0 }}>
                      {entry.text}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
            {hasMore && (
              <Typography
                onClick={() => setShowAllTimeline(!showAllTimeline)}
                sx={{
                  fontSize: 13, color: "#999", mt: 1.5, cursor: "pointer", userSelect: "none",
                  "&:hover": { color: "#262626" },
                }}
              >
                {showAllTimeline ? "收起" : `展开全部 ${timeline.length} 条`}
              </Typography>
            )}
          </Box>
        );
      })()}
    </Stack>
  );
}
