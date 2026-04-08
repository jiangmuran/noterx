import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Box, Typography, TextField, Button, Stack, Chip,
  CircularProgress, Alert, Paper, useTheme,
  useMediaQuery,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
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
  "美食": "food",
  "穿搭": "fashion",
  "科技": "tech",
  "数码": "tech",
  "旅行": "travel",
  "旅游": "travel",
  "美妆": "beauty",
  "健身": "fitness",
  "运动": "fitness",
};


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
  const [aiSuggestion, setAiSuggestion] = useState("");
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

    for (const [, r] of successRecogEntries) {
      if (r.slot_type === "content") {
        if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
        if (!bestContent && r.content_text?.trim()) bestContent = r.content_text.trim();
      }
      if (!bestCategory && r.category?.trim()) bestCategory = r.category.trim();
      if (!bestSummary && r.summary?.trim()) bestSummary = r.summary.trim();
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
      setAiRecogs((p) => ({ ...p, [key]: { success: false, slot_type: "unknown", category: "", summary: "", error: "识别失败" } }));
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
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const key = fkey(file);
      if (!aiRecogs[key] && !aiLoading[key]) {
        void runRecognition(file);
      }
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
    const recognizedSlots = new Set(
      successRecogEntries
        .map(([, r]) => (typeof r.slot_type === "string" ? r.slot_type : ""))
        .filter(Boolean),
    );
    const hasAny = files.length > 0;
    const hasBody = Boolean(content.trim() || aggregated.bestContent);
    const hasDetail = recognizedSlots.has("content");
    const hasCover = recognizedSlots.has("cover");
    const hasProfile = recognizedSlots.has("profile");
    const hasComments = recognizedSlots.has("comments");

    if (!hasAny) setAiSuggestion("");
    else if (!hasDetail) setAiSuggestion("未检测到笔记详情页截图，请上传包含标题+正文/标签的详情页，AI 才会提取笔记内容。");
    else if (!hasBody) setAiSuggestion("已检测到详情页，但正文仍不清晰，建议补充一张更清晰的详情截图。");
    else if (!hasCover) setAiSuggestion("可补充封面截图，提升视觉内容判断。");
    else if (!hasProfile) setAiSuggestion("可补充主页截图，帮助判断账号定位。");
    else if (!hasComments) setAiSuggestion("可补充评论区截图，分析互动质量。");
    else setAiSuggestion("信息较完整，可以直接开始诊断。");
  }, [files.length, successRecogEntries, content, aggregated.bestContent]);

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
        .map(([, r]) => (typeof r.slot_type === "string" ? r.slot_type : ""))
        .filter(Boolean),
    ),
    [successRecogEntries],
  );
  const hasDetailScreenshot = recognizedSlots.has("content");
  const canSubmit = files.length > 0 && title.trim().length > 0 && !lockInputs && !isFormBlocked && hasDetailScreenshot;
  const slotLabelMap: Record<string, string> = {
    content: "详情",
    cover: "封面",
    profile: "主页",
    comments: "评论区",
  };

  const guideCard = (
    <Box
      sx={{
        p: { xs: 1.5, md: 1.2 },
        borderRadius: "14px",
        flexShrink: 0,
        background: "linear-gradient(145deg, rgba(250, 251, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%)",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.88)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.9 }}>
        <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#111827", fontWeight: 700 }}>
          一次上传自动分拣
        </Typography>
        <Chip
          size="small"
          label={`${files.length}/9`}
          sx={{
            height: 24,
            fontSize: { xs: 10, md: 10 },
            fontWeight: 700,
            bgcolor: "rgba(37, 99, 235, 0.1)",
            color: "#1d4ed8",
            border: "1px solid rgba(37, 99, 235, 0.2)",
          }}
        />
      </Box>
      <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#4b5563", lineHeight: 1.6 }}>
        把视频和图片一次性上传，AI 会自动识别并区分封面、笔记详情、主页和评论区。
      </Typography>
      <Box sx={{ mt: 0.8, display: "flex", flexWrap: "wrap", gap: 0.7 }}>
        {Object.entries(slotLabelMap).map(([slot, label]) => (
          <Chip
            key={slot}
            size="small"
            label={label}
            color={recognizedSlots.has(slot) ? "success" : "default"}
            variant={recognizedSlots.has(slot) ? "filled" : "outlined"}
            sx={{ fontSize: 11, height: 24 }}
          />
        ))}
      </Box>
    </Box>
  );

  const aiPanel = (
    (processingStatus || anyLoading || successResults.length > 0 || allFailed || aiSuggestion) && (
      <Box
        sx={{
          p: { xs: 2, md: 1.35 },
          borderRadius: "14px",
          flexShrink: 0,
          bgcolor: allFailed ? "rgba(254, 243, 199, 0.35)" : "rgba(248, 250, 252, 0.9)",
          border: allFailed ? "1px solid rgba(245, 158, 11, 0.28)" : "1px solid rgba(0, 0, 0, 0.05)",
          boxShadow: allFailed ? "inset 0 1px 0 rgba(255,255,255,0.6)" : "inset 0 1px 0 rgba(255,255,255,0.8)",
          backdropFilter: "blur(8px)",
        }}
      >
        {processingStatus && (
          <Alert
            severity={processingStatus.tone}
            sx={{ mb: anyLoading || successResults.length > 0 || allFailed || aiSuggestion ? 1 : 0, py: 0 }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography sx={{ fontSize: { xs: 12, md: 11 }, fontWeight: 700 }}>{processingStatus.label}</Typography>
              <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "text.secondary" }}>{processingStatus.text}</Typography>
            </Box>
          </Alert>
        )}
        {anyLoading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: successResults.length > 0 ? 1 : 0 }}>
            <CircularProgress size={14} thickness={5} sx={{ color: "#ff2442" }} />
            <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#999" }}>AI 正在识别标题、正文和内容类型...</Typography>
          </Box>
        )}
        {allFailed && (
          <Box>
            <Typography sx={{ fontSize: { xs: 12, md: 11 }, fontWeight: 600, color: "#92400e", mb: 0.5 }}>
              当前素材的 AI 快速识别全部失败
            </Typography>
            <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#a16207", lineHeight: 1.65 }}>
              常见原因是后端未启动或 Key 无效。请确认本机 `uvicorn` 在 `8000` 端口运行，并检查 `backend/.env` 中的 `OPENAI_API_KEY`。若暂时无法识别，也可手动补充后继续诊断。
            </Typography>
          </Box>
        )}
        {successResults.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: aiSuggestion ? 1 : 0 }}>
            {successResults.map((r, i) => (
              <Chip
                key={i}
                icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                label={r.category ? `${r.category}${r.summary ? ` 路 ${r.summary.slice(0, 20)}` : ""}` : r.summary?.slice(0, 30)}
                size="small"
                sx={{
                  bgcolor: "rgba(16, 185, 129, 0.1)",
                  color: "#047857",
                  fontWeight: 600,
                  fontSize: 11,
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  "& .MuiChip-icon": { color: "#059669" },
                }}
              />
            ))}
          </Box>
        )}
        {aiSuggestion && !allFailed && (
          <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#4b5563", lineHeight: 1.55 }}>
            <Box component="span" sx={{ mr: 0.5 }} aria-hidden>✓</Box>
            {aiSuggestion}
          </Typography>
        )}
      </Box>
    )
  );

  const formFields = (
    <Stack spacing={{ xs: 2.5, md: 1.5 }}>
      <Box>
        <TextField
          label="笔记标题"
          required
          fullWidth
          size={isDesktop ? "small" : "medium"}
          disabled={lockInputs}
          value={title}
          onChange={(e) => { setTitle(e.target.value); setUserEdited((p) => ({ ...p, title: true })); }}
          placeholder="上传后 AI 会自动识别，也可手动输入"
          slotProps={{ htmlInput: { maxLength: 100 } }}
          helperText={lockInputs ? "AI 处理中，识别完成后会自动回填标题" : autoFilled.title ? "✓ AI 已自动回填，可自行修改" : `${title.length}/100`}
        />
        {showWarnings && warnings.title && !title.trim() && !userEdited.title && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="small" />} sx={{ mt: 0.5, py: 0, fontSize: 11 }}>
            AI 未从图片中识别到标题，请手动输入
          </Alert>
        )}
      </Box>
      <Box>
        <TextField
          label="笔记正文"
          fullWidth
          multiline
          rows={isDesktop ? 3 : 4}
          size={isDesktop ? "small" : "medium"}
          disabled={lockInputs}
          value={content}
          onChange={(e) => { setContent(e.target.value); setUserEdited((p) => ({ ...p, content: true })); }}
          placeholder="上传后 AI 会自动提取正文（包含标签）"
          helperText={lockInputs ? "AI 处理中，识别完成后会自动回填正文" : autoFilled.content ? "✓ AI 已自动提取正文，可自行修改" : undefined}
        />
        {showWarnings && warnings.content && !content.trim() && !userEdited.content && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="small" />} sx={{ mt: 0.5, py: 0, fontSize: 11 }}>
            AI 未提取到正文，可补充详情截图或手动输入
          </Alert>
        )}
      </Box>
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: { xs: 1, md: 0.75 } }}>
          <Typography sx={{ fontSize: { xs: 13, md: 12 }, color: "#999", fontWeight: 500 }}>选择垂类</Typography>
          {autoFilled.category && (
            <Chip
              label="AI 已识别"
              size="small"
              sx={{
                fontSize: 10,
                height: 22,
                fontWeight: 600,
                bgcolor: "rgba(16, 185, 129, 0.12)",
                color: "#047857",
                border: "1px solid rgba(16, 185, 129, 0.22)",
              }}
            />
          )}
        </Box>
        <CategoryPicker value={category} onChange={(v) => { setCategory(v); setUserEdited((p) => ({ ...p, category: true })); }} />
        {showWarnings && warnings.category && !userEdited.category && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="small" />} sx={{ mt: 0.5, py: 0, fontSize: 11 }}>
            AI 未识别垂类，请手动选择
          </Alert>
        )}
      </Box>
    </Stack>
  );

  const submitBtn = (
    <Button
      variant="contained"
      fullWidth
      disabled={!canSubmit}
      onClick={handleSubmit}
      sx={{
        py: { xs: 1.4, md: 1.1 },
        fontSize: { xs: "0.95rem", md: "0.9rem" },
        fontWeight: 600,
        borderRadius: "14px",
        minHeight: { xs: 48, md: 44 },
        flexShrink: 0,
      }}
    >
      开始诊断
    </Button>
  );


  /** 桌面布局 */
  const desktopLayout = (
    <Box
      sx={{
        height: "100dvh",
        maxHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(168deg, #f0eef2 0%, #e8eaef 38%, #f7f5f7 100%)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          px: 2,
          pt: 1.5,
          pb: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          borderBottom: "1px solid rgba(0,0,0,0.04)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 100%)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }} aria-hidden>
            <defs>
              <linearGradient id="homeLogoDesk" x1="4" y1="4" x2="26" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ff5c6f" />
                <stop offset="1" stopColor="#e61e3d" />
              </linearGradient>
            </defs>
            <rect width="28" height="28" rx="7" fill="url(#homeLogoDesk)" />
            <text x="14" y="19" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">Rx</text>
          </svg>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: "1.05rem",
                fontWeight: 800,
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                background: "linear-gradient(90deg, #1a1a1a 0%, #404040 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              薯医 NoteRx
            </Typography>
            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", lineHeight: 1.35, opacity: 0.92 }}>
              一次上传素材 → AI 自动识别 → 一键诊断
            </Typography>
          </Box>
        </Box>
        <Button
          startIcon={<HistoryOutlined sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/history")}
          size="small"
          sx={{
            color: "text.secondary",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            borderRadius: "10px",
            px: 1.25,
            "&:hover": { color: "text.primary", bgcolor: "rgba(255,36,66,0.06)" },
          }}
        >
          历史记录
        </Button>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          px: 2,
          pb: 1.5,
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 1100,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 2,
            minHeight: 0,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              borderRadius: "18px",
              border: "1px solid rgba(255,255,255,0.85)",
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              minHeight: 0,
              bgcolor: "rgba(255,255,255,0.78)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 10px 40px rgba(25, 20, 35, 0.07), 0 1px 0 rgba(255,255,255,0.95) inset",
            }}
          >
            {guideCard}
            <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} compact />
            </Box>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              borderRadius: "18px",
              border: "1px solid rgba(255,255,255,0.85)",
              p: 2,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              bgcolor: "rgba(255,255,255,0.78)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 10px 40px rgba(25, 20, 35, 0.07), 0 1px 0 rgba(255,255,255,0.95) inset",
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                mb: 1,
                flexShrink: 0,
                letterSpacing: "0.02em",
                color: "text.primary",
                borderLeft: "3px solid",
                borderColor: "primary.main",
                pl: 1,
                py: 0.25,
              }}
            >
              笔记信息
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
              {aiPanel}
              <Box sx={{ position: "relative" }}>
                {isFormBlocked && (
                  <Alert severity="info" sx={{ mb: 1 }}>
                    AI 正在识别图片内容，识别完成后可编辑“笔记信息”。
                  </Alert>
                )}
                <Box sx={{ opacity: isFormBlocked ? 0.5 : 1, pointerEvents: isFormBlocked ? "none" : "auto", transition: "opacity 0.2s ease" }}>
                  {formFields}
                </Box>
              </Box>
            </Box>
            <Box sx={{ pt: 1.5, flexShrink: 0 }}>
              {submitBtn}
              {files.length > 0 && allRecognitionDone && !hasDetailScreenshot && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  未检测到“笔记详情页”截图，暂不支持提交。请补充上传后再继续。
                </Alert>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>

      <Typography sx={{ flexShrink: 0, textAlign: "center", pb: 1, fontSize: "0.65rem", color: "text.disabled", letterSpacing: "0.04em" }}>
        薯医 NoteRx · AI 诊断仅供参考
      </Typography>
    </Box>
  );

  const mobileLayout = (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      sx={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #faf8fa 0%, #f3f1f5 55%, #faf9fb 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 2,
        py: 3,
        pb: 4,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 520, display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button
          startIcon={<HistoryOutlined sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/history")}
          sx={{
            color: "text.secondary",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: "10px",
            "&:hover": { color: "text.primary", bgcolor: "rgba(255,36,66,0.06)" },
          }}
        >
          历史记录
        </Button>
      </Box>
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 520,
          p: 2.5,
          borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.9)",
          bgcolor: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 12px 48px rgba(25, 20, 35, 0.08), 0 1px 0 rgba(255,255,255,0.95) inset",
        }}
      >
        <Stack spacing={2}>
          {guideCard}
          <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} />
          {aiPanel}
          <Box sx={{ position: "relative" }}>
            {isFormBlocked && (
              <Alert severity="info">
                AI 正在识别图片内容，识别完成后可编辑“笔记信息”。
              </Alert>
            )}
            <Box sx={{ opacity: isFormBlocked ? 0.5 : 1, pointerEvents: isFormBlocked ? "none" : "auto", transition: "opacity 0.2s ease", mt: isFormBlocked ? 1 : 0 }}>
              {formFields}
            </Box>
          </Box>
          {submitBtn}
          {files.length > 0 && allRecognitionDone && !hasDetailScreenshot && (
            <Alert severity="warning">
              未检测到“笔记详情页”截图，暂不支持提交。请补充上传后再继续。
            </Alert>
          )}
        </Stack>
      </Paper>
      <Typography sx={{ mt: 3, fontSize: "0.72rem", color: "text.disabled", letterSpacing: "0.03em" }}>
        薯医 NoteRx · AI 诊断仅供参考
      </Typography>
    </Box>
  );

  return isDesktop ? desktopLayout : mobileLayout;
}
