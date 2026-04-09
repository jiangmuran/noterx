import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  Box, Typography, TextField, Button, Chip,
  CircularProgress, useTheme,
  useMediaQuery,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CategoryPicker from "../components/CategoryPicker";
import UploadZone from "../components/UploadZone";
import { quickRecognize, quickRecognizeVideo } from "../utils/api";
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
const QUICK_RECOGNIZE_CONCURRENCY = 3;

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

  /** 待快识的视频（与 UploadZone 一致，至多一个视频位） */
  const videoFileKeys = useMemo(
    () => new Set(files.filter((f) => f.type.startsWith("video/")).map(fkey)),
    [files],
  );

  /** 图片 + 视频均需完成快识后解锁表单 */
  const recognizeFileKeys = useMemo(() => {
    const s = new Set<string>();
    imageFileKeys.forEach((k) => s.add(k));
    videoFileKeys.forEach((k) => s.add(k));
    return s;
  }, [imageFileKeys, videoFileKeys]);

  const pendingRecognition = useMemo(() => {
    if (recognizeFileKeys.size === 0) return false;
    for (const key of recognizeFileKeys) {
      if (aiLoading[key] || !aiRecogs[key]) return true;
    }
    return false;
  }, [recognizeFileKeys, aiLoading, aiRecogs]);

  const allRecognitionDone = useMemo(() => {
    if (recognizeFileKeys.size === 0) return true;
    for (const k of recognizeFileKeys) {
      if (!aiRecogs[k] && !aiLoading[k]) return false;
      if (aiLoading[k]) return false;
    }
    return true;
  }, [recognizeFileKeys, aiRecogs, aiLoading]);

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
    const { bestTitle, bestContent, bestCategory } = aggregated;
    return {
      /** 仅当有可写入标题的识别字段时标「已填」；仅有 summary 不会写入标题，避免空框却显示已填 */
      title: !userEdited.title && !!bestTitle,
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
      const res = file.type.startsWith("video/")
        ? await quickRecognizeVideo(file)
        : await quickRecognize(file, slotHint);
      setAiRecogs((p) => ({ ...p, [key]: res }));
    } catch (e: unknown) {
      let errMsg = "识别失败";
      if (axios.isAxiosError(e)) {
        const d = e.response?.data;
        if (d && typeof d === "object" && "detail" in d) {
          const det = (d as { detail: unknown }).detail;
          errMsg = typeof det === "string" ? det : JSON.stringify(det);
        } else if (e.code === "ERR_NETWORK" || e.message === "Network Error") {
          errMsg = "无法连接后端：请确认已启动 API，且端口与 Vite 代理一致（默认 8000，可用 VITE_API_PROXY_TARGET 覆盖）";
        } else if (e.message) {
          errMsg = e.message;
        }
      } else if (e instanceof Error && e.message) {
        errMsg = e.message;
      }
      setAiRecogs((p) => ({
        ...p,
        [key]: {
          success: false,
          slot_type: "unknown",
          extra_slots: [],
          category: "",
          summary: "",
          error: errMsg,
        },
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
    const mediaFiles = files.filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    const inFlight = mediaFiles.filter((f) => aiLoading[fkey(f)]).length;
    const freeSlots = Math.max(0, QUICK_RECOGNIZE_CONCURRENCY - inFlight);
    const need = mediaFiles.filter((f) => {
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
    if (prevPendingRecognitionRef.current && !pendingRecognition && recognizeFileKeys.size > 0) {
      if (analyzePulseTimerRef.current) clearTimeout(analyzePulseTimerRef.current);
      setAnalyzingPulse(true);
      analyzePulseTimerRef.current = setTimeout(() => {
        setAnalyzingPulse(false);
        analyzePulseTimerRef.current = null;
      }, 700);
    }
    prevPendingRecognitionRef.current = pendingRecognition;
  }, [pendingRecognition, recognizeFileKeys.size]);

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
      const videoPending = [...videoFileKeys].some((k) => aiLoading[k] || !aiRecogs[k]);
      const imagePending = [...imageFileKeys].some((k) => aiLoading[k] || !aiRecogs[k]);
      if (videoPending && !imagePending && imageFileKeys.size === 0) {
        return { label: "识别中", tone: "info" as const, text: "AI 正在识别视频内容（含画面与字幕），请稍候..." };
      }
      return { label: "识别中", tone: "info" as const, text: "AI 正在自动识别图片与视频..." };
    }
    if (analyzingPulse) {
      return { label: "分析中", tone: "info" as const, text: "正在汇总识别结果并回填表单..." };
    }
    if (allRecognitionDone) {
      return { label: "已就绪", tone: "success" as const, text: "识别完成，可以继续发起诊断。" };
    }
    return null;
  }, [
    files.length,
    uploadingPulse,
    pendingRecognition,
    analyzingPulse,
    allRecognitionDone,
    videoFileKeys,
    imageFileKeys,
    aiLoading,
    aiRecogs,
  ]);

  const lockInputs = !!processingStatus && processingStatus.label !== "已就绪";
  const isFormBlocked = files.length > 0 && !allRecognitionDone;

  const [submitError, setSubmitError] = useState("");

  const handleSubmit = () => {
    if (files.length === 0) { setSubmitError("请先上传笔记截图"); return; }
    if (!title.trim()) { setSubmitError("请输入笔记标题"); return; }
    if (lockInputs || isFormBlocked) { setSubmitError("AI 识别中，请稍等"); return; }
    setSubmitError("");
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
  /* aiSuggestion removed — detail screenshot warning shown inline below CTA */
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
      height: { md: "100dvh" },
      minHeight: { xs: "100dvh" },
      display: "flex",
      flexDirection: "column",
      bgcolor: "#fafafa",
      overflow: { xs: "auto", md: "hidden" },
    }}>

      {/* ═══ Header — 所有信息压在一行 ═══ */}
      <Box component="header" sx={{
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        px: { xs: 1.5, md: 3 }, height: 48,
        bgcolor: "#fff", borderBottom: "1px solid #f0f0f0",
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.75, md: 1.5 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
            <Box sx={{
              width: 24, height: 24, borderRadius: "6px",
              background: "linear-gradient(135deg, #ff5c6f, #e61e3d)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Typography sx={{ color: "#fff", fontSize: 10, fontWeight: 800, fontFamily: "Inter" }}>Rx</Typography>
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#262626", letterSpacing: "-0.02em" }}>
              薯医
            </Typography>
          </Box>
          {/* Desktop: inline description */}
          <Typography sx={{
            display: { xs: "none", md: "block" },
            fontSize: 12, color: "#999", fontWeight: 500,
          }}>
            AI 笔记诊断 · 大量真实数据训练
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button
            onClick={() => { setLeaving(true); setTimeout(() => { window.location.href = "/"; }, 400); }}
            size="small"
            sx={{ color: "#999", fontSize: 12, fontWeight: 600, minWidth: "auto", px: 1, borderRadius: "8px",
              "&:hover": { color: "#ff2442", bgcolor: "#fff0f2" } }}
          >
            白皮书
          </Button>
          <Button startIcon={<HistoryOutlined sx={{ fontSize: 14 }} />}
            onClick={() => navigate("/history")} size="small"
            sx={{ color: "#999", fontSize: 12, fontWeight: 600, minWidth: "auto", px: 1, borderRadius: "8px",
              "&:hover": { color: "#262626", bgcolor: "#f5f5f5" } }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>历史</Box>
          </Button>
        </Box>
      </Box>

      {/* ═══ Work area — 填满剩余空间，桌面不滚动 ═══ */}
      <Box sx={{
        flex: 1,
        display: "flex", justifyContent: "center", alignItems: "stretch",
        px: { xs: 0, md: 3 },
        py: { xs: 0, md: 2 },
        pb: { xs: "100px", md: 2 },
        overflow: { xs: "auto", md: "hidden" },
        minHeight: 0,
      }}>
        <Box sx={{
          width: "100%", maxWidth: 1000,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" },
          gap: { xs: 0, md: 2 },
          alignItems: "stretch",
          minHeight: 0,
        }}>

          {/* ═══ Left: Upload ═══ */}
          <Box sx={{
            bgcolor: "#fff",
            border: { md: "1px solid #f0f0f0" },
            borderBottom: { xs: "1px solid #f0f0f0", md: "1px solid #f0f0f0" },
            borderRadius: { xs: 0, md: "14px" },
            p: { xs: 2, md: 2.5 },
            display: "flex", flexDirection: "column",
            gap: 1.5,
            minHeight: 0,
            overflow: "hidden",
          }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#262626" }}>
                  上传笔记素材
                </Typography>
                <Typography sx={{ fontSize: 12, color: "#999", mt: 0.25 }}>
                  把小红书截图拖进来，AI 自动识别标题、正文、分类
                </Typography>
              </Box>
              {files.length > 0 && (
                <Chip size="small" label={`${files.length}/9`} sx={{
                  height: 22, fontSize: 10, fontWeight: 700,
                  bgcolor: isReady ? "#f0fdf4" : "#eff6ff",
                  color: isReady ? "#16a34a" : "#2563eb",
                  border: isReady ? "1px solid #bbf7d0" : "1px solid #bfdbfe",
                }} />
              )}
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} compact={isDesktop} />
            </Box>

            {/* Slot chips + AI status — 同一行 */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  style={{ flexShrink: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 0.75 }}>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
                      {Object.entries(slotLabelMap).map(([slot, label]) => (
                        <Chip key={slot} size="small" label={label}
                          color={recognizedSlots.has(slot) ? "success" : "default"}
                          variant={recognizedSlots.has(slot) ? "filled" : "outlined"}
                          sx={{ fontSize: 10, height: 20 }} />
                      ))}
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {(anyLoading || (processingStatus && processingStatus.tone === "info")) && (
                        <CircularProgress size={12} thickness={5} sx={{ color: "#ff2442" }} />
                      )}
                      {isReady && <CheckCircleIcon sx={{ fontSize: 13, color: "#16a34a" }} />}
                      <Typography sx={{ fontSize: 11, color: allFailed ? "#dc2626" : isReady ? "#16a34a" : "#999", fontWeight: 500 }}>
                        {allFailed ? "识别失败" : isReady ? "完成" : anyLoading ? "识别中" : ""}
                      </Typography>
                    </Box>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

          </Box>

          {/* ═══ Right: Form ═══ */}
          <Box sx={{
            bgcolor: "#fff",
            border: { md: "1px solid #f0f0f0" },
            borderRadius: { xs: 0, md: "14px" },
            p: { xs: 2, md: 2.5 },
            display: "flex", flexDirection: "column",
            gap: 1.75,
            minHeight: 0,
            overflow: { xs: "visible", md: "auto" },
          }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#262626", flexShrink: 0 }}>
              笔记信息
            </Typography>

            {isFormBlocked && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1, py: 0.5, borderRadius: "8px", bgcolor: "#eff6ff", flexShrink: 0 }}>
                <CircularProgress size={12} thickness={5} sx={{ color: "#3b82f6" }} />
                <Typography sx={{ fontSize: 12, color: "#3b82f6", fontWeight: 500 }}>AI 识别中，完成后自动填入</Typography>
              </Box>
            )}

            <Box sx={{
              flex: 1, minHeight: 0,
              opacity: isFormBlocked ? 0.4 : 1,
              pointerEvents: isFormBlocked ? "none" : "auto",
              transition: "opacity 0.3s",
              display: "flex", flexDirection: "column", gap: 1.75,
            }}>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#262626" }}>标题</Typography>
                  {autoFilled.title && <Typography sx={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>AI 已填</Typography>}
                </Box>
                <TextField required fullWidth size="small" disabled={lockInputs} value={title}
                  onChange={(e) => { setTitle(e.target.value); setUserEdited((p) => ({ ...p, title: true })); }}
                  placeholder="笔记标题" slotProps={{ htmlInput: { maxLength: 100 } }} />
                {showWarnings && warnings.title && !title.trim() && !userEdited.title && (
                  <Typography sx={{ fontSize: 11, color: "#d97706", mt: 0.5 }}>请手动输入标题</Typography>
                )}
              </Box>

              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#262626" }}>正文</Typography>
                  {autoFilled.content && <Typography sx={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>AI 已填</Typography>}
                </Box>
                <TextField fullWidth multiline rows={isDesktop ? 3 : 3} size="small" disabled={lockInputs} value={content}
                  onChange={(e) => { setContent(e.target.value); setUserEdited((p) => ({ ...p, content: true })); }}
                  placeholder="笔记正文（可选）" />
              </Box>

              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#262626" }}>垂类</Typography>
                  {autoFilled.category && <Typography sx={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>AI 已识别</Typography>}
                </Box>
                <CategoryPicker value={category} onChange={(v) => { setCategory(v); setUserEdited((p) => ({ ...p, category: true })); }} />
              </Box>
            </Box>

            {/* Desktop CTA */}
            <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", gap: 1, flexShrink: 0, pt: 0.5 }}>
              <Button variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}
                sx={{
                  py: 1.1, fontSize: 14, fontWeight: 700, borderRadius: "10px", minHeight: 42,
                  background: "#ff2442", boxShadow: "0 4px 16px rgba(255,36,66,0.25)",
                  "&:hover": { background: "#e61e3d", transform: "translateY(-1px)", boxShadow: "0 6px 24px rgba(255,36,66,0.35)" },
                  "&:active": { transform: "translateY(0)" },
                  "&.Mui-disabled": { background: "#eee", boxShadow: "none", color: "#bbb" },
                }}
              >
                开始诊断
              </Button>
              {files.length > 0 && allRecognitionDone && !hasDetailScreenshot && (
                <Typography sx={{ fontSize: 10, color: "#d97706", textAlign: "center" }}>建议补充详情页截图</Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ═══ Mobile fixed CTA ═══ */}
      <Box sx={{
        display: { xs: "block", md: "none" },
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        px: 1.5, pt: 1,
        pb: "max(8px, env(safe-area-inset-bottom))",
        bgcolor: "rgba(255,255,255,0.95)", borderTop: "1px solid #f0f0f0",
      }}>
        <Button variant="contained" fullWidth onClick={handleSubmit}
          sx={{
            py: 1.1, fontSize: 15, fontWeight: 700, borderRadius: "10px", minHeight: 46,
            background: canSubmit ? "#ff2442" : "#eee",
            boxShadow: canSubmit ? "0 4px 16px rgba(255,36,66,0.25)" : "none",
            color: canSubmit ? "#fff" : "#bbb",
            "&:hover": { background: canSubmit ? "#e61e3d" : "#eee" },
          }}
        >
          开始诊断
        </Button>
        {submitError && (
          <Typography sx={{ fontSize: 11, color: "#dc2626", textAlign: "center", mt: 0.5 }}>
            {submitError}
          </Typography>
        )}
      </Box>

      {/* Transition overlay */}
      <AnimatePresence>
        {leaving && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "#ff2442",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "#fff", fontSize: 18, fontWeight: 900 }}>薯医 NoteRx</Typography>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}
