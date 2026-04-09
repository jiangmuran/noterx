import { useState, useCallback } from "react";
import { Box, Typography, Button, CircularProgress } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { SimulatedComment, CommentWithReplies } from "../utils/api";
import { generateComments } from "../utils/api";

interface Props {
  comments: SimulatedComment[];
  noteTitle?: string;
  noteContent?: string;
  noteCategory?: string;
}

/* ── Avatar colors ── */
const AVATAR_COLORS = [
  "#ff2442", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarInitial(name: string): string {
  return name.charAt(0) || "?";
}

/* ── State types ── */
interface CommentState extends CommentWithReplies {
  _likes: number;
  _liked: boolean;
  _showReplies: boolean;
  _replies: Array<SimulatedComment & { _likes: number; _liked: boolean }>;
}

function toCommentState(c: SimulatedComment | CommentWithReplies): CommentState {
  const replies = ("replies" in c && Array.isArray(c.replies) ? c.replies : []).map((r) => ({
    ...r,
    _likes: r.likes ?? Math.floor(Math.random() * 80),
    _liked: false,
  }));
  return {
    ...c,
    _likes: c.likes ?? Math.floor(Math.random() * 200),
    _liked: false,
    _showReplies: replies.length > 0,
    _replies: replies,
  };
}

export default function SimulatedComments({ comments: initial, noteTitle = "", noteContent = "", noteCategory = "food" }: Props) {
  const [comments, setComments] = useState<CommentState[]>(() => initial.map(toCommentState));
  const [loading, setLoading] = useState(false);

  const toggleLike = useCallback((idx: number) => {
    setComments((prev) => prev.map((c, i) =>
      i === idx ? { ...c, _liked: !c._liked, _likes: c._liked ? c._likes - 1 : c._likes + 1 } : c
    ));
  }, []);

  const toggleReplyLike = useCallback((ci: number, ri: number) => {
    setComments((prev) => prev.map((c, i) => {
      if (i !== ci) return c;
      const nr = c._replies.map((r, j) =>
        j === ri ? { ...r, _liked: !r._liked, _likes: r._liked ? r._likes - 1 : r._likes + 1 } : r
      );
      return { ...c, _replies: nr };
    }));
  }, []);

  const toggleShowReplies = useCallback((idx: number) => {
    setComments((prev) => prev.map((c, i) =>
      i === idx ? { ...c, _showReplies: !c._showReplies } : c
    ));
  }, []);

  const handleLoadMore = async () => {
    setLoading(true);
    try {
      const nc = await generateComments({ title: noteTitle, content: noteContent, category: noteCategory, existing_count: comments.length });
      setComments((prev) => [...prev, ...nc.map(toCommentState)]);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  if (!comments.length) return <Typography sx={{ fontSize: 14, color: "#999" }}>暂无模拟评论</Typography>;

  return (
    <Box>
      {comments.map((c, i) => (
        <Box key={`${c.username}-${i}`} sx={{ py: 1.25, borderBottom: "1px solid #f5f5f5", "&:last-child": { borderBottom: "none" } }}>
          {/* Main comment */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            {/* Color avatar */}
            <Box sx={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              bgcolor: avatarColor(c.username),
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Typography sx={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>
                {avatarInitial(c.username)}
              </Typography>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Name + meta */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: "#262626" }}>
                  {c.username}
                </Typography>
                {c.is_author && (
                  <Box sx={{ px: 0.5, py: 0.1, borderRadius: "4px", bgcolor: "#fff0f2" }}>
                    <Typography sx={{ fontSize: 9, fontWeight: 700, color: "#ff2442" }}>作者</Typography>
                  </Box>
                )}
                {c.ip_location && (
                  <Typography sx={{ fontSize: 10, color: "#ccc" }}>{c.ip_location}</Typography>
                )}
              </Box>

              {/* Comment text */}
              <Typography sx={{ fontSize: 13, color: "#333", lineHeight: 1.6, mt: 0.25 }}>
                {c.comment}
              </Typography>

              {/* Actions row */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 0.5 }}>
                <Typography sx={{ fontSize: 10, color: "#ccc" }}>
                  {c.time_ago || "刚刚"}
                </Typography>
                <Box
                  onClick={() => toggleLike(i)}
                  sx={{
                    display: "flex", alignItems: "center", gap: 0.3, cursor: "pointer", userSelect: "none",
                    color: c._liked ? "#ff2442" : "#ccc",
                    "&:hover": { color: c._liked ? "#d91a36" : "#999" },
                    transition: "color 0.15s",
                  }}
                >
                  <HeartIcon filled={c._liked} size={13} />
                  <Typography sx={{ fontSize: 11, fontWeight: 500 }}>{c._likes || ""}</Typography>
                </Box>
                {c._replies.length > 0 && (
                  <Typography
                    onClick={() => toggleShowReplies(i)}
                    sx={{ fontSize: 11, color: "#999", cursor: "pointer", "&:hover": { color: "#262626" } }}
                  >
                    {c._showReplies ? "收起" : `${c._replies.length}条回复`}
                  </Typography>
                )}
              </Box>

              {/* Replies */}
              {c._showReplies && c._replies.length > 0 && (
                <Box sx={{ mt: 1, pl: 1, borderLeft: "2px solid #f5f5f5" }}>
                  {c._replies.map((r, j) => (
                    <Box key={j} sx={{ py: 0.75 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Box sx={{
                          width: 20, height: 20, borderRadius: "50%",
                          bgcolor: avatarColor(r.username),
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Typography sx={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>
                            {avatarInitial(r.username)}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#262626" }}>
                          {r.username}
                        </Typography>
                        {r.is_author && (
                          <Box sx={{ px: 0.4, py: 0.05, borderRadius: "3px", bgcolor: "#fff0f2" }}>
                            <Typography sx={{ fontSize: 8, fontWeight: 700, color: "#ff2442" }}>作者</Typography>
                          </Box>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 12, color: "#555", lineHeight: 1.5, mt: 0.2, pl: 3.25 }}>
                        {r.comment}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 0.3, pl: 3.25 }}>
                        <Typography sx={{ fontSize: 10, color: "#ccc" }}>{r.time_ago || "刚刚"}</Typography>
                        <Box onClick={() => toggleReplyLike(i, j)}
                          sx={{ display: "inline-flex", alignItems: "center", gap: 0.3, cursor: "pointer",
                            color: r._liked ? "#ff2442" : "#ccc", "&:hover": { color: r._liked ? "#d91a36" : "#999" } }}>
                          <HeartIcon filled={r._liked} size={11} />
                          <Typography sx={{ fontSize: 10, fontWeight: 500 }}>{r._likes || ""}</Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      ))}

      {/* Load more */}
      <Box sx={{ pt: 1.5, textAlign: "center" }}>
        <Button size="small"
          startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <RefreshIcon sx={{ fontSize: 15 }} />}
          disabled={loading} onClick={handleLoadMore}
          sx={{ color: "#999", fontSize: 12, fontWeight: 500, borderRadius: "8px", "&:hover": { color: "#262626", bgcolor: "#f5f5f5" } }}
        >
          {loading ? "生成中..." : "换一批评论"}
        </Button>
      </Box>
    </Box>
  );
}

function HeartIcon({ filled, size = 13 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
