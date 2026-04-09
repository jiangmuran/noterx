import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CategoryPicker from "../components/CategoryPicker";
import UploadZone from "../components/UploadZone";
import { showToast } from "../components/Toast";
import { quickRecognize } from "../utils/api";
import type { QuickRecognizeResult } from "../utils/api";

function fileKey(file: File) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

const CAT_MAP: Record<string, string> = {
  food: "food",
  fashion: "fashion",
  tech: "tech",
  travel: "travel",
  beauty: "beauty",
  fitness: "fitness",
  lifestyle: "lifestyle",
  home: "home",
  "缇庨": "food",
  "绌挎惌": "fashion",
  "绉戞妧": "tech",
  "鏃呮父": "travel",
  "缇庡": "beauty",
  "鍋ヨ韩": "fitness",
  "鐢熸椿": "lifestyle",
  "瀹跺眳": "home",
};

const QUICK_RECOGNIZE_CONCURRENCY = 2;
const SLOT_LABELS: Record<string, string> = {
  cover: "灏侀潰",
  content: "璇︽儏",
  profile: "涓婚〉",
  comments: "璇勮鍖?",
};

export default function Home() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("food");
  const [aiRecogs, setAiRecogs] = useState<Record<string, QuickRecognizeResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [userEdited, setUserEdited] = useState({ title: false, content: false, category: false });

  const recognizeInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    document.title = "钖尰 NoteRx";
  }, []);

  const handleFilesChange = useCallback((nextFiles: File[]) => {
    setFiles(nextFiles.slice(0, 9));
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }

      if (pastedFiles.length === 0) return;
      setFiles((prev) => [...prev, ...pastedFiles].slice(0, 9));
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const imageFiles = useMemo(() => files.filter((file) => file.type.startsWith("image/")), [files]);
  const imageKeys = useMemo(() => new Set(imageFiles.map(fileKey)), [imageFiles]);

  const pendingRecognition = useMemo(() => {
    if (imageKeys.size === 0) return false;
    for (const key of imageKeys) {
      if (aiLoading[key] || !aiRecogs[key]) return true;
    }
    return false;
  }, [aiLoading, aiRecogs, imageKeys]);

  const allRecognitionDone = useMemo(() => {
    if (imageKeys.size === 0) return true;
    for (const key of imageKeys) {
      if (aiLoading[key] || !aiRecogs[key]) return false;
    }
    return true;
  }, [aiLoading, aiRecogs, imageKeys]);

  const successRecogEntries = useMemo(
    () => Object.entries(aiRecogs).filter(([, result]) => result.success),
    [aiRecogs],
  );
  const allResults = useMemo(() => Object.values(aiRecogs), [aiRecogs]);
  const allFailed = imageKeys.size > 0 && allRecognitionDone && successRecogEntries.length === 0 && allResults.length > 0;

  const recognizedSlots = useMemo(
    () => new Set(successRecogEntries.map(([, result]) => (result.slot_type || "").toLowerCase()).filter(Boolean)),
    [successRecogEntries],
  );

  const aggregated = useMemo(() => {
    let bestTitle = "";
    let bestContent = "";
    let bestCategory = "";

    for (const [, result] of successRecogEntries) {
      if (!bestTitle && result.title?.trim()) bestTitle = result.title.trim();
      if (!bestContent && result.content_text?.trim()) bestContent = result.content_text.trim();
      if (!bestCategory && result.category?.trim()) bestCategory = result.category.trim();
    }

    return { bestTitle, bestContent, bestCategory };
  }, [successRecogEntries]);

  useEffect(() => {
    if (!userEdited.title && aggregated.bestTitle) setTitle(aggregated.bestTitle.slice(0, 100));
    if (!userEdited.content && aggregated.bestContent) setContent(aggregated.bestContent);
    if (!userEdited.category && aggregated.bestCategory) {
      const mapped = CAT_MAP[aggregated.bestCategory];
      if (mapped) setCategory(mapped);
    }
  }, [aggregated, userEdited]);

  const runRecognition = useCallback(async (file: File) => {
    const key = fileKey(file);
    if (recognizeInFlightRef.current.has(key)) return;

    recognizeInFlightRef.current.add(key);
    setAiLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const result = await quickRecognize(file);
      setAiRecogs((prev) => ({ ...prev, [key]: result }));
    } catch {
      setAiRecogs((prev) => ({
        ...prev,
        [key]: {
          success: false,
          slot_type: "unknown",
          category: "",
          summary: "",
          error: "璇嗗埆澶辫触",
        },
      }));
    } finally {
      recognizeInFlightRef.current.delete(key);
      setAiLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  useEffect(() => {
    const validKeys = new Set(files.map(fileKey));

    setAiRecogs((prev) => {
      const next: Record<string, QuickRecognizeResult> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
      });
      return next;
    });

    setAiLoading((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
      });
      return next;
    });

    recognizeInFlightRef.current.forEach((key) => {
      if (!validKeys.has(key)) recognizeInFlightRef.current.delete(key);
    });
  }, [files]);

  useEffect(() => {
    const inFlight = imageFiles.filter((file) => aiLoading[fileKey(file)]).length;
    const freeSlots = Math.max(0, QUICK_RECOGNIZE_CONCURRENCY - inFlight);
    const waitingFiles = imageFiles.filter((file) => {
      const key = fileKey(file);
      return !aiRecogs[key] && !aiLoading[key];
    });

    waitingFiles.slice(0, freeSlots).forEach((file) => {
      void runRecognition(file);
    });
  }, [aiLoading, aiRecogs, imageFiles, runRecognition]);

  useEffect(() => {
    if (files.length > 0) return;
    setAiRecogs({});
    setAiLoading({});
    setUserEdited({ title: false, content: false, category: false });
    setTitle("");
    setContent("");
    setCategory("food");
  }, [files.length]);

  const processingStatus = useMemo(() => {
    if (files.length === 0) return null;
    if (pendingRecognition) {
      return { tone: "info" as const, text: "AI 正在识别截图内容，请稍候..." };
    }
    if (allRecognitionDone) {
      return { tone: "success" as const, text: "素材已就绪，可以开始诊断。" };
    }
    return { tone: "info" as const, text: "素材已上传，正在准备识别..." };
  }, [allRecognitionDone, files.length, pendingRecognition]);

  const isFormBlocked = files.length > 0 && !allRecognitionDone;
  const canSubmit = files.length > 0 && title.trim().length > 0 && !isFormBlocked;
  const hasDetailScreenshot = recognizedSlots.has("content");

  const submitHint = useMemo(() => {
    if (files.length === 0) return "请先上传笔记素材";
    if (isFormBlocked) return "AI 识别完成后才能开始诊断";
    if (!title.trim()) {
      return allFailed ? "AI 未识别出标题，请手动填写标题后继续" : "请填写标题，或补充能识别标题的截图";
    }
    if (imageKeys.size > 0 && !hasDetailScreenshot) return "建议补充详情页截图，诊断结果会更完整";
    return "当前可以直接开始诊断";
  }, [allFailed, files.length, hasDetailScreenshot, imageKeys.size, isFormBlocked, title]);

  const handleSubmit = () => {
    if (files.length === 0) {
      showToast("请先上传笔记素材", "warning");
      return;
    }
    if (isFormBlocked) {
      showToast("AI 还在识别素材，稍后再试", "info");
      return;
    }
    if (!title.trim()) {
      showToast("请先填写标题，或补充可识别标题的截图", "warning");
      return;
    }

    navigate("/diagnosing", {
      state: {
        title,
        content,
        tags: "",
        category,
        coverFile: files.find((file) => file.type.startsWith("image/")) ?? null,
        coverImages: files.filter((file) => file.type.startsWith("image/")),
        videoFile: files.find((file) => file.type.startsWith("video/")) ?? null,
      },
    });
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", display: "flex", flexDirection: "column" }}>
      <Box
        component="header"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: { xs: 2, md: 3 },
          py: 1.5,
          bgcolor: "#fff",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: "#262626" }}>钖尰 NoteRx</Typography>
          <Typography sx={{ fontSize: 12, color: "#999" }}>AI 诊断你的小红书笔记</Typography>
        </Box>
        <Button
          startIcon={<HistoryOutlined sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/history")}
          sx={{ color: "#666", fontSize: 13, fontWeight: 600 }}
        >
          鍘嗗彶
        </Button>
      </Box>

      <Box
        sx={{
          width: "100%",
          maxWidth: 1080,
          mx: "auto",
          px: { xs: 2, md: 3 },
          py: { xs: 2, md: 3 },
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.1fr 0.9fr" },
          gap: 2,
          flex: 1,
        }}
      >
        <Box
          sx={{
            bgcolor: "#fff",
            border: "1px solid #f0f0f0",
            borderRadius: { xs: "16px", md: "18px" },
            p: { xs: 2, md: 2.5 },
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: "#262626" }}>上传素材</Typography>
              <Typography sx={{ fontSize: 12, color: "#999", mt: 0.5 }}>
                支持图片和视频，图片会自动识别标题、正文和垂类。
              </Typography>
            </Box>
            {files.length > 0 && (
              <Chip
                size="small"
                label={`${files.length}/9`}
                sx={{
                  bgcolor: canSubmit ? "#f0fdf4" : "#eff6ff",
                  color: canSubmit ? "#16a34a" : "#2563eb",
                  border: canSubmit ? "1px solid #bbf7d0" : "1px solid #bfdbfe",
                }}
              />
            )}
          </Box>

          <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} compact={isDesktop} />

          {allFailed && (
            <Box sx={{ px: 1.25, py: 1, borderRadius: "12px", bgcolor: "#fff7ed", border: "1px solid #fed7aa" }}>
              <Typography sx={{ fontSize: 12, color: "#c2410c", fontWeight: 600 }}>
                AI 暂时没识别出有效信息，可以手动填写标题后继续诊断。
              </Typography>
            </Box>
          )}

          {files.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                {Object.entries(SLOT_LABELS).map(([slot, label]) => (
                  <Chip
                    key={slot}
                    size="small"
                    label={label}
                    color={recognizedSlots.has(slot) ? "success" : "default"}
                    variant={recognizedSlots.has(slot) ? "filled" : "outlined"}
                  />
                ))}
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                {pendingRecognition && <CircularProgress size={14} thickness={5} sx={{ color: "#ff2442" }} />}
                {!pendingRecognition && allRecognitionDone && <CheckCircleIcon sx={{ fontSize: 14, color: "#16a34a" }} />}
                <Typography sx={{ fontSize: 11, color: pendingRecognition ? "#64748b" : "#16a34a", fontWeight: 600 }}>
                  {pendingRecognition ? "识别中" : "已就绪"}
                </Typography>
              </Box>
            </Box>
          )}

          {processingStatus && (
            <Typography sx={{ fontSize: 12, color: processingStatus.tone === "success" ? "#16a34a" : "#64748b" }}>
              {processingStatus.text}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            bgcolor: "#fff",
            border: "1px solid #f0f0f0",
            borderRadius: { xs: "16px", md: "18px" },
            p: { xs: 2, md: 2.5 },
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: "#262626" }}>笔记信息</Typography>

          <Box
            sx={{
              px: 1.25,
              py: 1,
              borderRadius: "12px",
              bgcolor: canSubmit ? "#f0fdf4" : "#fff7ed",
              border: canSubmit ? "1px solid #bbf7d0" : "1px solid #fed7aa",
            }}
          >
            <Typography sx={{ fontSize: 12, color: canSubmit ? "#166534" : "#c2410c", fontWeight: 600 }}>
              {submitHint}
            </Typography>
          </Box>

          <Box sx={{ opacity: isFormBlocked ? 0.5 : 1, pointerEvents: isFormBlocked ? "none" : "auto", transition: "opacity 0.2s ease" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#262626", mb: 0.5 }}>
              标题
            </Typography>
            <TextField
              fullWidth
              size="small"
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setUserEdited((prev) => ({ ...prev, title: true }));
              }}
              placeholder="请输入笔记标题"
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
          </Box>

          <Box sx={{ opacity: isFormBlocked ? 0.5 : 1, pointerEvents: isFormBlocked ? "none" : "auto", transition: "opacity 0.2s ease" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#262626", mb: 0.5 }}>
              正文
            </Typography>
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={isDesktop ? 4 : 3}
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setUserEdited((prev) => ({ ...prev, content: true }));
              }}
              placeholder="可选，补充笔记正文"
            />
          </Box>

          <Box sx={{ opacity: isFormBlocked ? 0.5 : 1, pointerEvents: isFormBlocked ? "none" : "auto", transition: "opacity 0.2s ease" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#262626", mb: 0.75 }}>
              垂类
            </Typography>
            <CategoryPicker
              value={category}
              onChange={(nextCategory) => {
                setCategory(nextCategory);
                setUserEdited((prev) => ({ ...prev, category: true }));
              }}
            />
          </Box>

          <Button
            variant="contained"
            fullWidth
            disabled={!canSubmit}
            onClick={handleSubmit}
            sx={{
              py: 1.2,
              fontSize: 15,
              fontWeight: 700,
              borderRadius: "12px",
              background: "#ff2442",
              boxShadow: "0 8px 24px rgba(255,36,66,0.18)",
              "&:hover": { background: "#e61e3d" },
              "&.Mui-disabled": { background: "#e5e7eb", color: "#9ca3af", boxShadow: "none" },
            }}
          >
            开始诊断
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
