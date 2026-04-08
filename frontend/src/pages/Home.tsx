import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Box, Typography, TextField, Button, Stack,
  Alert, CircularProgress, InputAdornment, Tab, Tabs,
} from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import CameraAltOutlined from "@mui/icons-material/CameraAltOutlined";
import LinkIcon from "@mui/icons-material/Link";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import HistoryIcon from "@mui/icons-material/History";
import CategoryPicker from "../components/CategoryPicker";
import UploadZone from "../components/UploadZone";
import { parseLink } from "../utils/api";

const tabContent = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

type InputMode = "text" | "screenshot" | "link";

const SAMPLES = [
  { title: "5步搞定！零失败的懒人蛋炒饭", content: "今天教大家做超简单的蛋炒饭，只需要鸡蛋、隔夜饭和葱花。", tags: "美食分享,蛋炒饭,快手菜", category: "food" },
  { title: "这件外套也太好看了吧", content: "今年秋冬必入的一件外套！面料超舒服，版型也很好。", tags: "穿搭,秋冬穿搭,外套推荐", category: "fashion" },
  { title: "用了3个月的平板终于来测评了", content: "作为一个重度用户，这款平板的使用体验如何？今天给大家详细聊聊。", tags: "科技,平板测评,数码好物", category: "tech" },
];

interface HistoryItem {
  title: string;
  score: number;
  grade: string;
  category: string;
  date: number;
}

const GRADE_COLOR: Record<string, string> = {
  S: "#ea580c", A: "#16a34a", B: "#2563eb", C: "#d97706", D: "#dc2626",
};

const CATEGORY_LABEL: Record<string, string> = {
  food: "美食", fashion: "穿搭", tech: "科技", travel: "旅行", beauty: "美妆", fitness: "健身",
};

export default function Home() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<InputMode>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("food");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("noterx_history");
      if (raw) setHistory(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) { setCoverFile(file); setMode("screenshot"); }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  useEffect(() => { document.title = "薯医 NoteRx"; }, []);

  const canSubmit = mode === "screenshot" ? coverFile !== null : title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate("/diagnosing", { state: { title, content, tags, category, coverFile } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && canSubmit && mode === "text") {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      e.preventDefault();
      handleSubmit();
    }
  };

  const fillSample = (s: typeof SAMPLES[0]) => {
    setTitle(s.title);
    setContent(s.content);
    setTags(s.tags);
    setCategory(s.category);
    setMode("text");
  };

  const handleParseLink = async () => {
    if (!linkUrl.trim()) return;
    setLinkLoading(true);
    setLinkError("");
    try {
      const result = await parseLink(linkUrl);
      if (result.success) {
        setTitle(result.title);
        setContent(result.content);
        setTags(result.tags.join(","));
        setMode("text");
      } else {
        setLinkError(result.error || "解析失败");
      }
    } catch {
      setLinkError("网络错误");
    } finally {
      setLinkLoading(false);
    }
  };

  const tabIndex = mode === "text" ? 0 : mode === "screenshot" ? 1 : 2;

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
      <Box onKeyDown={handleKeyDown} sx={{ width: "100%", maxWidth: 520, bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "16px", boxShadow: "0 1px 8px rgba(0,0,0,0.04)", overflow: "hidden" }}>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setMode((["text", "screenshot", "link"] as InputMode[])[v])}
          variant="fullWidth"
          sx={{
            borderBottom: "1px solid #f0f0f0", minHeight: 44,
            "& .MuiTabs-indicator": { bgcolor: "#ff2442", height: 2 },
            "& .MuiTab-root": { textTransform: "none", fontWeight: 500, fontSize: "0.85rem", color: "#999", minHeight: 44, gap: 0.5, "&.Mui-selected": { color: "#262626", fontWeight: 600 } },
          }}
        >
          <Tab icon={<DescriptionOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="文字" />
          <Tab icon={<CameraAltOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="截图" />
          <Tab icon={<LinkIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="链接" />
        </Tabs>

        <Box sx={{ p: { xs: 2.5, md: 3 } }}>
          <AnimatePresence mode="wait">
            {mode === "text" && (
              <motion.div key="text" {...tabContent}>
                <Stack spacing={2.5}>
                  <TextField label="笔记标题" required fullWidth value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入你的笔记标题" slotProps={{ htmlInput: { maxLength: 100 } }} helperText={`${title.length}/100`} />
                  <TextField label="笔记正文" fullWidth multiline rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="粘贴你的笔记正文（可选）" />
                  <TextField label="标签" fullWidth value={tags} onChange={(e) => setTags(e.target.value)} placeholder="用逗号分隔，如：美食分享,减脂餐,食谱" />
                </Stack>
              </motion.div>
            )}
            {mode === "screenshot" && (
              <motion.div key="screenshot" {...tabContent}>
                <Stack spacing={2}>
                  <UploadZone file={coverFile} onFileSelect={setCoverFile} />
                  <TextField label="笔记标题（可选，留空由 AI 识别）" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} />
                </Stack>
              </motion.div>
            )}
            {mode === "link" && (
              <motion.div key="link" {...tabContent}>
                <Stack spacing={2}>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <TextField fullWidth label="小红书笔记链接" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="粘贴小红书分享链接"
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><LinkIcon sx={{ color: "#ccc", fontSize: 20 }} /></InputAdornment> } }}
                    />
                    <Button variant="contained" disabled={linkLoading || !linkUrl.trim()} onClick={handleParseLink} sx={{ minWidth: 72, flexShrink: 0, borderRadius: "12px" }}>
                      {linkLoading ? <CircularProgress size={20} color="inherit" /> : "解析"}
                    </Button>
                  </Box>
                  {linkError && <Alert severity="error" sx={{ borderRadius: "12px" }}>{linkError}</Alert>}
                  {title && <Alert severity="success" icon={false} sx={{ borderRadius: "12px" }}><Typography sx={{ fontSize: 13 }}>已解析：{title}</Typography></Alert>}
                </Stack>
              </motion.div>
            )}
          </AnimatePresence>

          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#999", mb: 1 }}>选择垂类</Typography>
            <CategoryPicker value={category} onChange={setCategory} />
          </Box>

          <Button variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}
            sx={{ mt: 3, py: 1.4, fontSize: "0.95rem", fontWeight: 600, borderRadius: "12px", height: 48, bgcolor: "#ff2442", "&:hover": { bgcolor: "#d91a36" }, "&.Mui-disabled": { bgcolor: "#f0f0f0", color: "#bbb" } }}
          >
            开始诊断
          </Button>
        </Box>
      </Box>

      {/* Sample notes */}
      <Box sx={{ width: "100%", maxWidth: 520, mt: 3 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#999", mb: 1 }}>快速体验</Typography>
        <Stack direction="row" spacing={1} sx={{ overflow: "auto", pb: 0.5 }}>
          {SAMPLES.map((s, i) => (
            <Box
              key={i}
              onClick={() => fillSample(s)}
              sx={{
                flexShrink: 0, px: 1.5, py: 1, borderRadius: "10px", cursor: "pointer",
                bgcolor: "#fff", border: "1px solid #f0f0f0",
                "&:hover": { borderColor: "#ddd", bgcolor: "#fafafa" },
                transition: "all 0.15s", minWidth: 140, maxWidth: 200,
              }}
            >
              <Typography sx={{ fontSize: 12, color: "#999", mb: 0.25 }}>{CATEGORY_LABEL[s.category]}</Typography>
              <Typography sx={{ fontSize: 13, color: "#262626", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.title}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>

      {/* History */}
      {history.length > 0 && (
        <Box sx={{ width: "100%", maxWidth: 520, mt: 3 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#999", mb: 1 }}>最近诊断</Typography>
          <Stack spacing={0} sx={{ bgcolor: "#fff", border: "1px solid #f0f0f0", borderRadius: "12px", overflow: "hidden" }}>
            {history.slice(0, 5).map((h, i) => (
              <Box
                key={i}
                sx={{
                  px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1.5,
                  borderBottom: i < Math.min(history.length, 5) - 1 ? "1px solid #f5f5f5" : "none",
                }}
              >
                <Typography sx={{ fontSize: 18, fontWeight: 700, color: GRADE_COLOR[h.grade] || "#999", width: 28, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                  {h.score}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, color: "#262626", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.title}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "#ccc" }}>
                    {CATEGORY_LABEL[h.category] || h.category} · {new Date(h.date).toLocaleDateString()}
                  </Typography>
                </Box>
                <Box sx={{ px: 1, py: 0.25, borderRadius: "6px", bgcolor: "#f5f5f5" }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: GRADE_COLOR[h.grade] || "#999" }}>{h.grade}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      <Typography sx={{ mt: 5, fontSize: "0.72rem", color: "#ccc" }}>薯医 NoteRx · AI 诊断仅供参考</Typography>
    </Box>
  );
}
