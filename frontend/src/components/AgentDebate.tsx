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

const AGENT_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  "内容分析师": { bg: "#fff5f6", accent: "#ff2442", text: "#dc2626" },
  "视觉诊断师": { bg: "#faf5ff", accent: "#8b5cf6", text: "#7c3aed" },
  "增长策略师": { bg: "#fffbeb", accent: "#f59e0b", text: "#d97706" },
  "用户模拟器": { bg: "#eff6ff", accent: "#3b82f6", text: "#2563eb" },
  "综合裁判": { bg: "#f0fdf4", accent: "#10b981", text: "#059669" },
};

const KIND_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  agree: { color: "#16a34a", bg: "#f0fdf4", label: "赞同" },
  rebuttal: { color: "#dc2626", bg: "#fef2f2", label: "反驳" },
  add: { color: "#2563eb", bg: "#eff6ff", label: "补充" },
};

function agentInitial(name: string): string {
  return name.charAt(0) || "?";
}

export default function AgentDebate({ opinions, summary, timeline }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  return (
    <Stack spacing={2}>
      {summary && (
        <Box sx={{ bgcolor: "#f9f9f9", borderRadius: "10px", px: 2, py: 1.5 }}>
          <Typography sx={{ fontSize: 13, color: "#555", lineHeight: 1.7 }}>{summary}</Typography>
        </Box>
      )}

      {/* Agent opinion cards */}
      {opinions.map((op, idx) => {
        const isOpen = expandedIdx === idx;
        const colors = AGENT_COLORS[op.agent_name] || { bg: "#f9f9f9", accent: "#666", text: "#333" };
        const scoreColor = op.score >= 75 ? "#16a34a" : op.score >= 50 ? "#d97706" : "#dc2626";
        return (
          <Box key={idx}>
            <Box onClick={() => setExpandedIdx(isOpen ? null : idx)} sx={{
              display: "flex", alignItems: "center", gap: 1.25,
              px: 1.5, py: 1.25, cursor: "pointer",
              borderRadius: isOpen ? "12px 12px 0 0" : "12px",
              bgcolor: colors.bg, border: `1px solid ${colors.accent}20`,
              "&:hover": { bgcolor: `${colors.accent}10` },
            }}>
              <Box sx={{ width: 32, height: 32, borderRadius: "8px", flexShrink: 0,
                bgcolor: colors.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography sx={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{agentInitial(op.agent_name)}</Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: "#262626" }}>{op.agent_name}</Typography>
                <Typography sx={{ fontSize: 11, color: "#999" }}>{op.dimension}</Typography>
              </Box>
              <Typography sx={{ fontWeight: 800, fontSize: 16, color: scoreColor }}>{Math.round(op.score)}</Typography>
              <ExpandMoreIcon sx={{ color: "#bbb", fontSize: 18, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </Box>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
                  <Box sx={{ px: 2, py: 1.5, border: `1px solid ${colors.accent}20`, borderTop: "none", borderRadius: "0 0 12px 12px", bgcolor: "#fff" }}>
                    <Stack spacing={1.25}>
                      {op.issues.length > 0 && (
                        <Box>
                          <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#dc2626", mb: 0.5 }}>问题</Typography>
                          {op.issues.map((issue, i) => (
                            <Typography key={i} sx={{ fontSize: 12, color: "#555", lineHeight: 1.6, pl: 1, borderLeft: "2px solid #fecaca", mb: 0.5 }}>{issue}</Typography>
                          ))}
                        </Box>
                      )}
                      {op.suggestions.length > 0 && (
                        <Box>
                          <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.text, mb: 0.5 }}>建议</Typography>
                          {op.suggestions.map((sug, i) => (
                            <Typography key={i} sx={{ fontSize: 12, color: "#555", lineHeight: 1.6, pl: 1, borderLeft: `2px solid ${colors.accent}40`, mb: 0.5 }}>{sug}</Typography>
                          ))}
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

      {/* Debate timeline — simple list, no carousel, no auto-scroll */}
      {timeline && timeline.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 14, color: "#262626", mb: 1.5 }}>
            辩论过程 · {timeline.length} 条
          </Typography>
          <Stack spacing={1}>
            {(showAllTimeline ? timeline : timeline.slice(0, 3)).map((entry, i) => {
              const kind = KIND_STYLE[entry.kind] || KIND_STYLE.add;
              const colors = AGENT_COLORS[entry.agent_name] || { accent: "#666", bg: "#f9f9f9", text: "#333" };
              return (
                <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Box sx={{
                    width: 24, height: 24, borderRadius: "6px", flexShrink: 0, mt: 0.25,
                    bgcolor: colors.accent, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Typography sx={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{agentInitial(entry.agent_name)}</Typography>
                  </Box>
                  <Box sx={{
                    flex: 1, minWidth: 0, px: 1.5, py: 1,
                    borderRadius: "4px 10px 10px 10px",
                    bgcolor: kind.bg, border: `1px solid ${kind.color}15`,
                  }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#262626" }}>{entry.agent_name}</Typography>
                      <Box sx={{ fontSize: 9, fontWeight: 700, color: kind.color, bgcolor: `${kind.color}12`, borderRadius: "4px", px: 0.5, py: 0.1 }}>
                        {kind.label}
                      </Box>
                    </Box>
                    <Typography sx={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>{entry.text}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
          {timeline.length > 3 && (
            <Typography onClick={() => setShowAllTimeline(!showAllTimeline)}
              sx={{ fontSize: 12, color: "#999", mt: 1, cursor: "pointer", "&:hover": { color: "#262626" } }}>
              {showAllTimeline ? "收起" : `展开全部 ${timeline.length} 条`}
            </Typography>
          )}
        </Box>
      )}
    </Stack>
  );
}
