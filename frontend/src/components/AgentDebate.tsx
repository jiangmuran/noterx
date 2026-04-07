import { useState } from "react";
import {
  Box, Typography, Chip, Collapse,
  Accordion, AccordionSummary, AccordionDetails, Stack,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { AgentOpinion, DebateEntry } from "../utils/api";

interface Props {
  opinions: AgentOpinion[];
  summary: string;
  timeline?: DebateEntry[];
}

const AGENT_AVATARS: Record<string, string> = {
  "内容分析师": "📝",
  "视觉诊断师": "🎨",
  "增长策略师": "📈",
  "用户模拟器": "💬",
  "综合裁判": "⚖️",
};

const KIND_CONFIG: Record<string, { label: string; color: "success" | "error" | "info" }> = {
  agree: { label: "赞同", color: "success" },
  rebuttal: { label: "反驳", color: "error" },
  add: { label: "补充", color: "info" },
};

/**
 * Agent 诊断详情与辩论时间线
 */
export default function AgentDebate({ opinions, summary, timeline }: Props) {
  const [showTimeline, setShowTimeline] = useState(false);

  return (
    <Stack spacing={2}>
      {/* 辩论总结 */}
      {summary && (
        <Box sx={{ bgcolor: "warning.light", borderRadius: 2, p: 2, opacity: 0.9 }}>
          <Typography variant="subtitle2" color="warning.dark" gutterBottom>
            ⚔️ 辩论总结
          </Typography>
          <Typography variant="body2">{summary}</Typography>
        </Box>
      )}

      {/* 辩论时间线 */}
      {timeline && timeline.length > 0 && (
        <Box>
          <Typography
            variant="body2"
            color="primary"
            sx={{ cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}
            onClick={() => setShowTimeline(!showTimeline)}
          >
            <ExpandMoreIcon
              sx={{
                fontSize: 18,
                transform: showTimeline ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
            辩论过程详情（{timeline.length} 条交锋）
          </Typography>

          <Collapse in={showTimeline}>
            <Box sx={{ mt: 1.5, pl: 2, borderLeft: "3px solid", borderColor: "primary.light" }}>
              {timeline.map((entry, i) => {
                const avatar = AGENT_AVATARS[entry.agent_name] || "🤖";
                const kind = KIND_CONFIG[entry.kind] || KIND_CONFIG.add;
                return (
                  <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 2 }}>
                    <Typography fontSize={20} sx={{ ml: -2.8, bgcolor: "background.paper", borderRadius: "50%" }}>
                      {avatar}
                    </Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
                        <Typography variant="caption" fontWeight={600}>
                          {entry.agent_name}
                        </Typography>
                        <Chip label={kind.label} color={kind.color} size="small" sx={{ height: 20, fontSize: "0.7rem" }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {entry.text}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Agent 各自意见 */}
      {opinions.map((op, idx) => {
        const avatar = AGENT_AVATARS[op.agent_name] || "🤖";
        const scoreColor = op.score >= 75 ? "primary.main" : op.score >= 50 ? "warning.main" : "error.main";

        return (
          <Accordion key={idx} disableGutters variant="outlined" sx={{ "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1 }}>
                <Typography fontSize={28}>{avatar}</Typography>
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={600}>{op.agent_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{op.dimension}</Typography>
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: scoreColor, mr: 1 }}>
                  {Math.round(op.score)}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {op.issues.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="error" fontWeight={600} gutterBottom>
                      发现问题
                    </Typography>
                    {op.issues.map((issue, i) => (
                      <Typography key={i} variant="body2" color="text.secondary" sx={{ display: "flex", gap: 1, mb: 0.5 }}>
                        <span style={{ color: "#ef4444" }}>•</span> {issue}
                      </Typography>
                    ))}
                  </Box>
                )}
                {op.suggestions.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="primary" fontWeight={600} gutterBottom>
                      优化建议
                    </Typography>
                    {op.suggestions.map((sug, i) => (
                      <Typography key={i} variant="body2" color="text.secondary" sx={{ display: "flex", gap: 1, mb: 0.5 }}>
                        <span style={{ color: "#10b981" }}>✦</span> {sug}
                      </Typography>
                    ))}
                  </Box>
                )}
                {op.reasoning && (
                  <Box sx={{ bgcolor: "grey.50", borderRadius: 2, p: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} gutterBottom>
                      分析过程
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {op.reasoning}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}
