import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Box, Typography, TextField, Button, Stack } from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import CategoryPicker from "../components/CategoryPicker";
import UploadZone from "../components/UploadZone";

export default function Home() {
  const navigate = useNavigate();

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("food");

  useEffect(() => {
    document.title = "薯医 NoteRx";
  }, []);

  /** Ctrl+V paste image shortcut */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
          const file = item.getAsFile();
          if (file) setMediaFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const canSubmit = mediaFile !== null && title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate("/diagnosing", {
      state: { title, content, tags: "", category, coverFile: mediaFile },
    });
  };

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      sx={{
        minHeight: "100vh",
        bgcolor: "#fafafa",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 2,
        py: { xs: 5, md: 8 },
      }}
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

      {/* Input card */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 520,
          bgcolor: "#fff",
          border: "1px solid #f0f0f0",
          borderRadius: "16px",
          boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
          overflow: "hidden",
          p: { xs: 2.5, md: 3 },
        }}
      >
        <Stack spacing={2.5}>
          {/* Media upload */}
          <UploadZone
            file={mediaFile}
            onFileSelect={(f) => setMediaFile(f)}
            accept={["image", "video"]}
          />

          {/* Title */}
          <TextField
            label="笔记标题"
            required
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入你的笔记标题"
            slotProps={{ htmlInput: { maxLength: 100 } }}
            helperText={`${title.length}/100`}
          />

          {/* Content */}
          <TextField
            label="笔记正文"
            fullWidth
            multiline
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="粘贴或输入你的笔记正文"
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
              py: 1.4,
              fontSize: "0.95rem",
              fontWeight: 600,
              borderRadius: "12px",
              height: 48,
              bgcolor: "#ff2442",
              "&:hover": { bgcolor: "#d91a36" },
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
