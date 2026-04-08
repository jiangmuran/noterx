import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Box, Typography, TextField, Button, Chip,
  CircularProgress, useTheme,
  useMediaQuery,
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

/** 中文垂类 -> 英文 key 映射 */
const CAT_MAP: Record<string, string> = {
  "美食": "food", "食谱": "food", "做饭": "food", "烘焙": "food",
  "穿搭": "fashion", "时尚": "fashion", "服装": "fashion", "outfit": "fashion",
  "科技": "tech", "数码": "tech", "手机": "tech", "电脑": "tech",
  "旅行": "travel", "旅游": "travel", "景点": "travel",
  "美妆": "beauty", "护肤": "beauty", "化妆": "beauty",
  "健身": "fitness", "运动": "fitness", "减肥": "fitness",
  "生活": "lifestyle", "日常": "lifestyle", "vlog": "lifestyle",
  "家居": "home", "装修": "home", "家装": "home",
  // English keys pass through
  "food": "food", "fashion": "fashion", "tech": "tech", "travel": "travel",
  "beauty": "beauty", "fitness": "fitness", "lifestyle": "lifestyle", "home": "home",
};

/** 快识并行路数：略限流可减少总排队，利于接近「单张 <5s」的体感 */
const QUICK_RECOGNIZE_CONCURRENCY = 2;

/** 首页：桌面端双栏布局，移动端单页布局 */
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
  const [uploadingPulse, setUploadingPulse] = useState(false);
  const [analyzingPulse, setAnalyzingPulse] = useState(false);

  const [userEdited, setUserEdited] = useState({ title: false, content: false, category: false });

  const uploadPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognizeInFlightRef = useRef<Set<string>>(new Set());
  const prevPendingRecognitionRef = useRef(false);

  useEffect(() => { document.title = "薯医 NoteRx"; }, []);

  useEffect(() => {
    return () => {
      if (uploadPulseTimerRef.current) clearTimeout(uploadPulseTimerRef.current);
      if (analyzePulseTimerRef.current) clearTimeout(analyzePulseTimerRef.current);
    };
  }, []);

  const triggerUploadPulse = useCallback(() => {
    if (uploadPulseTimerRef.current) clearTimeout(uploadPulseTimerRef.current);
    setUploadingPulse(true);
    uploadPulseTimerRef.current = setTimeout(() => {
      setUploadingPulse(false);
      uploadPulseTimerRef.current = null;
    }, 500);
  }, []);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      setFiles(newFiles.slice(0, 9));
      if (newFiles.length > 0) triggerUploadPulse();
    },
    [triggerUploadPulse],
  );

  const appendFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      setFiles((prev) => [...prev, ...incoming].slice(0, 9));
      triggerUploadPulse();
    },
    [triggerUploadPulse],
  );

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
      appendFiles(pasted);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [appendFiles]);

  const anyLoading = useMemo(() => Object.values(aiLoading).some(Boolean), [aiLoading]);
  const allResults = useMemo(() => Object.values(aiRecogs), [aiRecogs]);
  const successRecogEntries = useMemo(
    () => Object.entries(aiRecogs).filter(([, r]) => r.success),
    [aiRecogs],
  );
  const successResults = useMemo(
    () => successRecogEntries.map(([, r]) => r),
    [successRecogEntries],
  );

  const aggregated = useMemo(() => {
    let bestTitle = "";
    let bestContent = "";
    let bestCategory = "";
    let bestSummary = "";

    // 优先从 content 类型提取，但如果没有 content 类型，也从其他类型提取
    for (const [, r] of successRecogEntries) {
      if ((r.slot_type || "").toLowerCase() === "content") {
        if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
        if (!bestContent && r.content_text?.trim()) bestContent = r.content_text.trim();
      }
      if (!bestCategory && r.category?.trim()) bestCategory = r.category.trim();
      if (!bestSummary && r.summary?.trim()) bestSummary = r.summary.trim();
    }
    // Fallback: 如果 content 类型没提取到，从任意类型取
    if (!bestTitle || !bestContent) {
      for (const [, r] of successRecogEntries) {
        if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
        if (!bestContent && r.content_text?.trim()) bestContent = r.content_text.trim();
      }
    }

    return { bestTitle, bestContent, bestCategory, bestSummary };
  }, [successRecogEntries]);

  const imageFileKeys = useMemo(
    () => new Set(files.filter((f) => f.type.startsWith("image/")).map(fkey)),
    [files],
  );

  const pendingRecognition = useMemo(() => {
    if (imageFileKeys.size === 0) return false;
    for (const key of imageFileKeys) {
      if (aiLoading[key] || !aiRecogs[key]) return true;
    }
    return false;
  }, [imageFileKeys, aiLoading, aiRecogs]);

  const allRecognitionDone = useMemo(() => {
    if (imageFileKeys.size === 0) return false;
    for (const k of imageFileKeys) {
      if (!aiRecogs[k] && !aiLoading[k]) return false;
      if (aiLoading[k]) return false;
    }
    return true;
  }, [imageFileKeys, aiRecogs, aiLoading]);

  useEffect(() => {
    const { bestTitle, bestContent, bestCategory } = aggregated;

    if (!userEdited.title && bestTitle) {
      setTitle(bestTitle.slice(0, 100));
    }
    if (!userEdited.content && bestContent) {
      setContent(bestContent);
    }
    if (!userEdited.category && bestCategory) {
      const mapped = CAT_MAP[bestCategory];
      if (mapped) setCategory(mapped);
    }
  }, [aggregated, userEdited]);

  const allFailed = allRecognitionDone && successResults.length === 0 && allResults.length > 0;

  const showWarnings = allRecognitionDone && files.length > 0 && !allFailed;
  const warnings = useMemo(() => {
    if (!showWarnings) return { title: false, content: false, category: false };
    const { bestTitle, bestContent, bestCategory, bestSummary } = aggregated;
    return {
      title: !bestTitle && !bestSummary,
      content: !bestContent,
      category: !bestCategory,
    };
  }, [showWarnings, aggregated]);

  const autoFilled = useMemo(() => {
    const { bestTitle, bestContent, bestCategory, bestSummary } = aggregated;
    return {
      title: !userEdited.title && !!(bestTitle || bestSummary),
      content: !userEdited.content && !!bestContent,
      category: !userEdited.category && !!bestCategory && !!CAT_MAP[bestCategory],
    };
  }, [aggregated, userEdited]);

  const runRecognition = useCallback(async (file: File, slotHint?: "cover" | "content" | "profile" | "comments") => {
    const key = fkey(file);
    if (recognizeInFlightRef.current.has(key)) return;
    recognizeInFlightRef.current.add(key);
    setAiLoading((p) => {
      if (p[key]) return p;
      return { ...p, [key]: true };
    });
    try {
      const res = await quickRecognize(file, slotHint);
      setAiRecogs((p) => ({ ...p, [key]: res }));
    } catch {
      setAiRecogs((p) => ({
        ...p,
        [key]: { success: false, slot_type: "unknown", extra_slots: [], category: "", summary: "", error: "识别失败" },
      }));
    } finally {
      recognizeInFlightRef.current.delete(key);
      setAiLoading((p) => ({ ...p, [key]: false }));
    }
  }, []);

  useEffect(() => {
    const validKeys = new Set(files.map(fkey));
    setAiRecogs((prev) => {
      let changed = false;
      const next: Record<string, QuickRecognizeResult> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
        else changed = true;
      });
      return changed ? next : prev;
    });
    setAiLoading((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
        else changed = true;
      });
      return changed ? next : prev;
    });
    recognizeInFlightRef.current.forEach((key) => {
      if (!validKeys.has(key)) recognizeInFlightRef.current.delete(key);
    });
  }, [files]);

  useEffect(() => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const inFlight = imageFiles.filter((f) => aiLoading[fkey(f)]).length;
    const freeSlots = Math.max(0, QUICK_RECOGNIZE_CONCURRENCY - inFlight);
    const need = imageFiles.filter((f) => {
      const k = fkey(f);
      return !aiRecogs[k] && !aiLoading[k];
    });
    need.slice(0, freeSlots).forEach((file) => {
      void runRecognition(file);
    });
  }, [files, aiRecogs, aiLoading, runRecognition]);

  useEffect(() => {
    if (!prevPendingRecognitionRef.current && pendingRecognition && analyzePulseTimerRef.current) {
      clearTimeout(analyzePulseTimerRef.current);
      analyzePulseTimerRef.current = null;
      setAnalyzingPulse(false);
    }
    if (prevPendingRecognitionRef.current && !pendingRecognition && imageFileKeys.size > 0) {
      if (analyzePulseTimerRef.current) clearTimeout(analyzePulseTimerRef.current);
      setAnalyzingPulse(true);
      analyzePulseTimerRef.current = setTimeout(() => {
        setAnalyzingPulse(false);
        analyzePulseTimerRef.current = null;
      }, 700);
    }
    prevPendingRecognitionRef.current = pendingRecognition;
  }, [pendingRecognition, imageFileKeys.size]);

  useEffect(() => {
    if (files.length === 0) {
      setAiRecogs({});
      setAiLoading({});
      recognizeInFlightRef.current.clear();
      setUserEdited({ title: false, content: false, category: false });
      setTitle("");
      setContent("");
      setCategory("food");
      setUploadingPulse(false);
      setAnalyzingPulse(false);
      if (uploadPulseTimerRef.current) {
        clearTimeout(uploadPulseTimerRef.current);
        uploadPulseTimerRef.current = null;
      }
      if (analyzePulseTimerRef.current) {
        clearTimeout(analyzePulseTimerRef.current);
        analyzePulseTimerRef.current = null;
      }
    }
  }, [files.length]);

  const processingStatus = useMemo(() => {
    if (files.length === 0) return null;
    if (uploadingPulse) {
      return { label: "上传中", tone: "info" as const, text: "素材已接收，正在准备识别..." };
    }
    if (pendingRecognition) {
      return { label: "识别中", tone: "info" as const, text: "AI 正在自动识别封面/详情/主页/评论区..." };
    }
    if (analyzingPulse) {
      return { label: "分析中", tone: "info" as const, text: "正在汇总识别结果并回填表单..." };
    }
    if (allRecognitionDone) {
      return { label: "已就绪", tone: "success" as const, text: "识别完成，可以继续发起诊断。" };
    }
    return null;
  }, [files.length, uploadingPulse, pendingRecognition, analyzingPulse, allRecognitionDone]);

  const lockInputs = !!processingStatus && processingStatus.label !== "已就绪";
  const isFormBlocked = files.length > 0 && !allRecognitionDone;

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate("/diagnosing", {
      state: {
        title, content, tags: "", category,
        coverFile: files.find((f) => f.type.startsWith("image/")) ?? null,
        coverImages: files.filter((f) => f.type.startsWith("image/")),
        videoFile: files.find((f) => f.type.startsWith("video/")) ?? null,
      },
    });
  };

  const recognizedSlots = useMemo(
    () => new Set(
      successRecogEntries
        .map(([, r]) => (typeof r.slot_type === "string" ? r.slot_type.toLowerCase() : ""))
        .filter(Boolean),
    ),
    [successRecogEntries],
  );
  const hasDetailScreenshot = recognizedSlots.has("content");
  const canSubmit = files.length > 0 && title.trim().length > 0 && !lockInputs && !isFormBlocked;
  const aiSuggestion = useMemo(() => {
    if (files.length === 0) return "";
    if (!allRecognitionDone) return "";
    const hasBody = Boolean(content.trim() || aggregated.bestContent);
    const hasCover = recognizedSlots.has("cover");
    const hasProfile = recognizedSlots.has("profile");
    const hasComments = recognizedSlots.has("comments");

    if (!hasDetailScreenshot) return "建议补充笔记详情页截图（含标题+正文），AI 提取效果更好。也可手动输入后直接诊断。";
    if (!hasBody) return "已检测到详情页，但正文仍不清晰，建议补充一张更清晰的详情截图。";
    if (!hasCover) return "可补充封面截图，提升视觉内容判断。";
    if (!hasProfile) return "可补充主页截图，帮助判断账号定位。";
    if (!hasComments) return "可补充评论区截图，分析互动质量。";
    return "信息较完整，可以直接开始诊断。";
  }, [files.length, allRecognitionDone, content, aggregated.bestContent, recognizedSlots, hasDetailScreenshot]);
  const slotLabelMap: Record<string, string> = {
    content: "详情",
    cover: "封面",
    profile: "主页",
    comments: "评论区",
  };

  const isReady = files.length > 0 && allRecognitionDone;
  const [leaving, setLeaving] = useState(false);

  return (
    <Box sx={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      bgcolor: "#fafafa",
      /* Subtle warm radial from top */
      backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,36,66,0.04), transparent 70%)",
    }}>

      {/* ═══════════ Header ═══════════ */}
      <Box
        component="header"
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: { xs: 2, md: 3 },
          py: { xs: 1.25, md: 1.5 },
          bgcolor: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{
            width: 30, height: 30, borderRadius: "8px",
            background: "linear-gradient(135deg, #ff5c6f, #e61e3d)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Typography sx={{ color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "Inter, system-ui, sans-serif" }}>
              Rx
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: "#1a1a1a", lineHeight: 1.2 }}>
              薯医
            </Typography>
          </Box>
        </Box>

        {/* Desktop: trust signal in center */}
        <Typography sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center", gap: 0.75,
          fontSize: 12, color: "#999", fontWeight: 500,
        }}>
          <Box component="span" sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#10b981", display: "inline-block" }} />
          874 条真实数据 · 5 位 AI 专家诊断
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, md: 1 } }}>
          <Button
            onClick={() => { setLeaving(true); setTimeout(() => { window.location.href = "/"; }, 450); }}
            size="small"
            sx={{
              color: "#bbb", fontSize: 12, fontWeight: 500, minWidth: "auto",
              borderRadius: "8px", px: 1,
              "&:hover": { color: "#ff2442", bgcolor: "rgba(255,36,66,0.04)" },
            }}
          >
            白皮书
          </Button>
          <Button
            startIcon={<HistoryOutlined sx={{ fontSize: 15 }} />}
            onClick={() => navigate("/history")}
            size="small"
            sx={{
              color: "#999", fontSize: 12, fontWeight: 600, flexShrink: 0,
              borderRadius: "10px", px: 1.25, minWidth: "auto",
              "&:hover": { color: "#1a1a1a", bgcolor: "rgba(0,0,0,0.04)" },
            }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>历史</Box>
          </Button>
        </Box>
      </Box>

      {/* ═══════════ Hero ═══════════ */}
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        sx={{
          textAlign: "center",
          pt: { xs: 3.5, md: 4 },
          pb: { xs: 2, md: 2.5 },
          px: 3,
        }}
      >
        <Typography sx={{
          fontSize: { xs: 22, md: 28 },
          fontWeight: 800,
          color: "#1a1a1a",
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
          mb: 0.75,
        }}>
          AI 诊断你的小红书笔记
        </Typography>
        <Typography sx={{
          fontSize: { xs: 14, md: 15 },
          color: "#999",
          lineHeight: 1.6,
          maxWidth: 420,
          mx: "auto",
        }}>
          上传笔记截图，5 位 AI 专家帮你发现问题、给出优化方案
        </Typography>
      </Box>

      {/* ═══════════ Body ═══════════ */}
      <Box sx={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: { xs: "flex-start", md: "flex-start" },
        px: { xs: 0, md: 3 },
        py: { xs: 0, md: 0 },
        pb: { xs: "88px", md: 3 },
        overflow: "auto",
      }}>
        <Box sx={{
          width: "100%",
          maxWidth: 1080,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" },
          gap: { xs: 0, md: 2.5 },
          alignItems: "start",
        }}>

          {/* ═══════════ Left: Upload ═══════════ */}
          <Box sx={{
            bgcolor: "#fff",
            borderRadius: { xs: 0, md: "22px" },
            border: { xs: "none", md: "1px solid rgba(0,0,0,0.06)" },
            boxShadow: { xs: "none", md: "0 4px 24px rgba(0,0,0,0.04)" },
            p: { xs: 2.5, md: 3 },
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            {/* Upload header */}
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
                <Typography sx={{ fontSize: { xs: 17, md: 16 }, fontWeight: 800, color: "#1a1a1a", letterSpacing: "-0.01em" }}>
                  上传笔记素材
                </Typography>
                {files.length > 0 && (
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                    <Chip
                      size="small"
                      label={`${files.length}/9`}
                      sx={{
                        height: 24, fontSize: 11, fontWeight: 700,
                        bgcolor: isReady ? "rgba(16,185,129,0.1)" : "rgba(37,99,235,0.08)",
                        color: isReady ? "#059669" : "#2563eb",
                        border: isReady ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(37,99,235,0.15)",
                      }}
                    />
                  </motion.div>
                )}
              </Box>
              <Typography sx={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>
                把小红书笔记的截图拖进来（详情页、封面、主页、评论区都行）
              </Typography>
            </Box>

            {/* Upload zone */}
            <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} compact={isDesktop} />

            {/* Slot chips */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
                    <Typography sx={{ fontSize: 11, color: "#bbb", fontWeight: 600, mr: 0.25 }}>识别:</Typography>
                    {Object.entries(slotLabelMap).map(([slot, label]) => (
                      <Chip
                        key={slot} size="small" label={label}
                        color={recognizedSlots.has(slot) ? "success" : "default"}
                        variant={recognizedSlots.has(slot) ? "filled" : "outlined"}
                        sx={{ fontSize: 11, height: 22, fontWeight: 500 }}
                      />
                    ))}
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI status */}
            <AnimatePresence>
              {(processingStatus || anyLoading || allFailed) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: "hidden" }}
                >
                  <Box sx={{
                    display: "flex", alignItems: "center", gap: 1,
                    px: 1.5, py: 1, borderRadius: "10px",
                    bgcolor: allFailed ? "rgba(239,68,68,0.06)" : "rgba(0,0,0,0.02)",
                  }}>
                    {(anyLoading || (processingStatus && processingStatus.tone === "info")) && (
                      <CircularProgress size={14} thickness={5} sx={{ color: "#ff2442" }} />
                    )}
                    {processingStatus?.tone === "success" && (
                      <CheckCircleIcon sx={{ fontSize: 15, color: "#10b981" }} />
                    )}
                    <Typography sx={{ fontSize: 12, color: allFailed ? "#dc2626" : "#666", fontWeight: 500 }}>
                      {allFailed ? "识别失败，请检查后端或手动输入" : processingStatus?.text || "AI 正在识别..."}
                    </Typography>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success chips */}
            <AnimatePresence>
              {successResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {successResults.map((r, i) => (
                      <Chip key={i}
                        icon={<CheckCircleIcon sx={{ fontSize: 12 }} />}
                        label={r.category || r.summary?.slice(0, 20) || "已识别"}
                        size="small"
                        sx={{
                          bgcolor: "rgba(16,185,129,0.08)", color: "#047857", fontWeight: 600,
                          fontSize: 11, height: 22, border: "1px solid rgba(16,185,129,0.15)",
                          "& .MuiChip-icon": { color: "#10b981" },
                        }}
                      />
                    ))}
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile: trust signal */}
            <Typography sx={{
              display: { xs: "flex", md: "none" },
              alignItems: "center", gap: 0.5,
              fontSize: 11, color: "#bbb", pt: 0.5,
            }}>
              <Box component="span" sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "#10b981" }} />
              基于 874 条真实笔记 · 5 位 AI 专家诊断
            </Typography>
          </Box>

          {/* ═══════════ Right: Form ═══════════ */}
          <Box sx={{
            bgcolor: "#fff",
            borderRadius: { xs: 0, md: "22px" },
            borderTop: { xs: "1px solid rgba(0,0,0,0.06)", md: "none" },
            border: { md: "1px solid rgba(0,0,0,0.06)" },
            boxShadow: { xs: "none", md: "0 4px 24px rgba(0,0,0,0.04)" },
            p: { xs: 2.5, md: 3 },
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          }}>
            <Typography sx={{ fontSize: { xs: 17, md: 16 }, fontWeight: 800, color: "#1a1a1a", letterSpacing: "-0.01em" }}>
              笔记信息
            </Typography>

            {/* Form blocked overlay */}
            {isFormBlocked && (
              <Box sx={{
                display: "flex", alignItems: "center", gap: 1,
                px: 1.5, py: 1, borderRadius: "10px", bgcolor: "rgba(59,130,246,0.06)",
              }}>
                <CircularProgress size={14} thickness={5} sx={{ color: "#3b82f6" }} />
                <Typography sx={{ fontSize: 12, color: "#3b82f6", fontWeight: 500 }}>
                  AI 识别中，完成后自动填入
                </Typography>
              </Box>
            )}

            <Box sx={{
              opacity: isFormBlocked ? 0.4 : 1,
              pointerEvents: isFormBlocked ? "none" : "auto",
              transition: "opacity 0.3s ease",
              display: "flex",
              flexDirection: "column",
              gap: 2.5,
            }}>
              {/* Title */}
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#333" }}>标题</Typography>
                  {autoFilled.title && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                      <CheckCircleIcon sx={{ fontSize: 12, color: "#10b981" }} />
                      <Typography sx={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>AI 已填</Typography>
                    </Box>
                  )}
                </Box>
                <TextField
                  required fullWidth size="small"
                  disabled={lockInputs} value={title}
                  onChange={(e) => { setTitle(e.target.value); setUserEdited((p) => ({ ...p, title: true })); }}
                  placeholder="笔记标题，上传截图后自动识别"
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  helperText={`${title.length}/100`}
                />
                {showWarnings && warnings.title && !title.trim() && !userEdited.title && (
                  <Typography sx={{ fontSize: 11, color: "#d97706", mt: 0.5, fontWeight: 500 }}>
                    AI 未识别到标题，请手动输入
                  </Typography>
                )}
              </Box>

              {/* Content */}
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#333" }}>正文</Typography>
                  {autoFilled.content && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                      <CheckCircleIcon sx={{ fontSize: 12, color: "#10b981" }} />
                      <Typography sx={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>AI 已填</Typography>
                    </Box>
                  )}
                </Box>
                <TextField
                  fullWidth multiline rows={isDesktop ? 3 : 4} size="small"
                  disabled={lockInputs} value={content}
                  onChange={(e) => { setContent(e.target.value); setUserEdited((p) => ({ ...p, content: true })); }}
                  placeholder="笔记正文内容（可选）"
                />
              </Box>

              {/* Category */}
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#333" }}>垂类</Typography>
                  {autoFilled.category && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                      <CheckCircleIcon sx={{ fontSize: 12, color: "#10b981" }} />
                      <Typography sx={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>AI 已识别</Typography>
                    </Box>
                  )}
                </Box>
                <CategoryPicker value={category} onChange={(v) => { setCategory(v); setUserEdited((p) => ({ ...p, category: true })); }} />
              </Box>
            </Box>

            {/* Desktop submit */}
            <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", gap: 1.5, pt: 0.5 }}>
              <Button
                variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}
                sx={{
                  py: 1.4, fontSize: 15, fontWeight: 700, borderRadius: "14px",
                  minHeight: 48, letterSpacing: "0.01em",
                }}
              >
                开始诊断
              </Button>

              {files.length > 0 && allRecognitionDone && !hasDetailScreenshot && (
                <Typography sx={{ fontSize: 11, color: "#d97706", textAlign: "center", lineHeight: 1.5 }}>
                  建议补充笔记详情页截图以提高准确度
                </Typography>
              )}

              {aiSuggestion && !allFailed && !aiSuggestion.includes("补充笔记详情页截图") && (
                <Typography sx={{ fontSize: 11, color: "#bbb", textAlign: "center" }}>
                  {aiSuggestion}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ═══════════ Mobile fixed bottom ═══════════ */}
      <Box sx={{
        display: { xs: "block", md: "none" },
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        px: 2, pt: 1.25,
        pb: "max(12px, env(safe-area-inset-bottom))",
        bgcolor: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <Button
          variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}
          sx={{
            py: 1.4, fontSize: 16, fontWeight: 700, borderRadius: "14px",
            minHeight: 50, letterSpacing: "0.01em",
          }}
        >
          开始诊断
        </Button>
        {files.length > 0 && allRecognitionDone && !hasDetailScreenshot && (
          <Typography sx={{ fontSize: 10, color: "#d97706", textAlign: "center", mt: 0.75, lineHeight: 1.4 }}>
            建议补充详情页截图以提高准确度
          </Typography>
        )}
      </Box>

      {/* ═══════════ Page transition overlay ═══════════ */}
      <AnimatePresence>
        {leaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "linear-gradient(135deg, #ff3d5c, #e61e3d)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 8,
            }}
          >
            <Box sx={{
              width: 48, height: 48, borderRadius: "12px",
              bgcolor: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Typography sx={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>Rx</Typography>
            </Box>
            <Typography sx={{ color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: 600 }}>
              薯医 NoteRx
            </Typography>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}
