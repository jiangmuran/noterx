import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Box, Typography, TextField, Button, Stack, Chip,
  CircularProgress,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CategoryPicker from "../components/CategoryPicker";
import UploadZone from "../components/UploadZone";
import { quickRecognize } from "../utils/api";
import type { QuickRecognizeResult } from "../utils/api";

/** @returns A stable key for a File object */
function fkey(f: File) {
  return `${f.name}_${f.size}_${f.lastModified}`;
}

export default function Home() {
  const navigate = useNavigate();

  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("food");

  const [aiRecogs, setAiRecogs] = useState<Record<string, QuickRecognizeResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [titleAutoFilled, setTitleAutoFilled] = useState(false);

  useEffect(() => { document.title = "薯医 NoteRx"; }, []);

  /** Ctrl+V paste images */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
          const file = item.getAsFile();
          if (file) pasted.push(file);
        }
      }
      if (pasted.length > 0) setFiles((prev) => [...prev, ...pasted].slice(0, 9));
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  /**
   * 每张新图上传后自动调用 AI 快识。
   * 第一张识别成功时自动填充标题和垂类。
   */
  const runRecognition = useCallback(async (file: File) => {
    const key = fkey(file);
    if (aiRecogs[key] || aiLoading[key]) return;

    setAiLoading((p) => ({ ...p, [key]: true }));
    try {
      const res = await quickRecognize(file);
      setAiRecogs((p) => ({ ...p, [key]: res }));

      if (res.success) {
        setTitle((prev) => {
          if (prev.trim()) return prev;
          setTitleAutoFilled(true);
          return res.summary?.slice(0, 80) || prev;
        });

        if (res.category) {
          const catMap: Record<string, string> = {
            "美食": "food", "穿搭": "fashion", "科技": "tech",
            "旅行": "travel", "美妆": "beauty", "健身": "fitness",
          };
          const mapped = catMap[res.category];
          if (mapped) setCategory(mapped);
        }
      }
    } catch {
      // silent — user can still manually fill
    } finally {
      setAiLoading((p) => ({ ...p, [key]: false }));
    }
  }, [aiRecogs, aiLoading]);

  /** Update AI suggestion based on current upload state */
  useEffect(() => {
    const imgCount = files.filter((f) => f.type.startsWith("image/")).length;
    const hasVideo = files.some((f) => f.type.startsWith("video/"));

    if (files.length === 0) {
      setAiSuggestion("");
    } else if (imgCount === 1 && !hasVideo) {
      setAiSuggestion("建议再上传正文截图或评论区截图，让诊断更全面");
    } else if (imgCount === 2) {
      setAiSuggestion("不错！可以继续补充主页截图和评论区截图");
    } else if (imgCount >= 3) {
      setAiSuggestion("图片充足，可以直接开始诊断了");
    } else if (hasVideo && imgCount === 0) {
      setAiSuggestion("建议再补一张封面截图，提升视觉维度分析效果");
    } else {
      setAiSuggestion("");
    }
  }, [files]);

  /** Trigger recognition for each newly added file */
  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      setFiles(newFiles);
      for (const f of newFiles) {
        if (f.type.startsWith("image/")) runRecognition(f);
      }
    },
    [runRecognition],
  );

  const canSubmit = files.length > 0 && title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate("/diagnosing", {
      state: {
        title,
        content,
        tags: "",
        category,
        coverFile: files.find((f) => f.type.startsWith("image/")) ?? null,
        coverImages: files.filter((f) => f.type.startsWith("image/")),
        videoFile: files.find((f) => f.type.startsWith("video/")) ?? null,
      },
    });
  };

  const anyLoading = Object.values(aiLoading).some(Boolean);
  const recognizedList = Object.values(aiRecogs).filter((r) => r.success);

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      sx={{ minHeight: "100vh", bgcolor: "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", px: 2, py: { xs: 5, md: 8 } }}
    >
      {/* Header */}
      <Box sx={{ width: "100%", maxWidth: 520, display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button
          startIcon={<HistoryOutlined sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/history")}
          sx={{ color: "#999", fontSize: 13, fontWeight: 500, "&:hover": { color: "#262626" } }}
        >
          历史记录
        </Button>
      </Box>

      {/* Brand */}
      <Box sx={{ textAlign: "center", mb: { xs: 3, md: 4 } }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#ff2442" />
            <text x="14" y="19" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">Rx</text>
          </svg>
          <Typography sx={{ fontSize: "1.4rem", fontWeight: 700, color: "#262626" }}>薯医 NoteRx</Typography>
        </Box>
        <Typography sx={{ fontSize: "0.85rem", color: "#999", mt: 0.25 }}>AI 诊断你的小红书笔记</Typography>
      </Box>

      {/* Main card */}
      <Box sx={{ width: "100%", maxWidth: 520, bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "16px", boxShadow: "0 1px 8px rgba(0,0,0,0.04)", overflow: "hidden", p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={2.5}>
          {/* Multi-file upload */}
          <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} />

          {/* AI real-time feedback panel */}
          {(anyLoading || recognizedList.length > 0 || aiSuggestion) && (
            <Box sx={{ p: 2, borderRadius: "12px", bgcolor: "#fafbfc", border: "1px solid #f0f0f0" }}>
              {anyLoading && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: recognizedList.length > 0 ? 1 : 0 }}>
                  <CircularProgress size={14} sx={{ color: "#ff2442" }} />
                  <Typography sx={{ fontSize: 12, color: "#999" }}>AI 正在识别上传内容...</Typography>
                </Box>
              )}
              {recognizedList.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: aiSuggestion ? 1 : 0 }}>
                  {recognizedList.map((r, i) => (
                    <Chip
                      key={i}
                      icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                      label={r.category ? `${r.category}${r.summary ? ` · ${r.summary.slice(0, 20)}` : ""}` : r.summary?.slice(0, 30)}
                      size="small"
                      sx={{ bgcolor: "#f0fdf4", color: "#16a34a", fontWeight: 500, fontSize: 11, "& .MuiChip-icon": { color: "#16a34a" } }}
                    />
                  ))}
                </Box>
              )}
              {aiSuggestion && (
                <Typography sx={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                  💡 {aiSuggestion}
                </Typography>
              )}
            </Box>
          )}

          {/* Title — auto-filled by AI */}
          <Box>
            <TextField
              label="笔记标题"
              required
              fullWidth
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleAutoFilled(false); }}
              placeholder="上传图片后 AI 自动识别，也可手动输入"
              slotProps={{ htmlInput: { maxLength: 100 } }}
              helperText={titleAutoFilled ? "AI 已自动识别填充标题，可自行修改" : `${title.length}/100`}
            />
          </Box>

          {/* Content */}
          <TextField
            label="笔记正文"
            fullWidth
            multiline
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="粘贴或输入你的笔记正文（可选）"
          />

          {/* Category */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#999", mb: 1 }}>选择垂类</Typography>
            <CategoryPicker value={category} onChange={setCategory} />
          </Box>

          {/* Submit */}
          <Button
            variant="contained"
            fullWidth
            disabled={!canSubmit}
            onClick={handleSubmit}
            sx={{
              py: 1.4, fontSize: "0.95rem", fontWeight: 600, borderRadius: "12px", height: 48,
              bgcolor: "#ff2442", "&:hover": { bgcolor: "#d91a36" },
              "&.Mui-disabled": { bgcolor: "#f0f0f0", color: "#bbb" },
            }}
          >
            开始诊断
          </Button>
        </Stack>
      </Box>

      <Typography sx={{ mt: 5, fontSize: "0.72rem", color: "#ccc" }}>薯医 NoteRx · AI 诊断仅供参考</Typography>
    </Box>
  );
}
