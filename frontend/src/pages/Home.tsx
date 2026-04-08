import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Box, Typography, TextField, Button, Stack, Chip,
  CircularProgress, Alert, Paper, Stepper, Step, StepLabel, useTheme,
  useMediaQuery,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import CategoryPicker from "../components/CategoryPicker";
import UploadZone from "../components/UploadZone";
import { quickRecognize } from "../utils/api";
import type { QuickRecognizeResult } from "../utils/api";

/** @returns A stable key for a File object */
function fkey(f: File) {
  return `${f.name}_${f.size}_${f.lastModified}`;
}

/** 中文垂类 → 英文 key 映射 */
const CAT_MAP: Record<string, string> = {
  "美食": "food", "穿搭": "fashion", "科技": "tech", "数码": "tech",
  "旅行": "travel", "旅游": "travel", "美妆": "beauty",
  "健身": "fitness", "运动": "fitness",
};

const WIZARD_LABELS = ["上传素材", "完善信息并开始"];

/**
 * 首页：移动端为两步向导（上传后自动进入填写页，可返回）；桌面端为双栏卡片 + 固定视口，表单区内部滚动。
 */
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

  const [userEdited, setUserEdited] = useState({ title: false, content: false, category: false });

  /** 移动端分步：`auto` 上传后自动进第 2 步；`hold` 用户点「返回」后暂停自动跳转 */
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardHold, setWizardHold] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const anyLoading = useMemo(() => Object.values(aiLoading).some(Boolean), [aiLoading]);
  const allResults = useMemo(() => Object.values(aiRecogs), [aiRecogs]);
  const successResults = useMemo(() => allResults.filter((r) => r.success), [allResults]);

  const aggregated = useMemo(() => {
    let bestTitle = "";
    let bestContent = "";
    let bestCategory = "";
    let bestSummary = "";

    for (const r of successResults) {
      if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
      if (!bestContent && r.content_text?.trim()) bestContent = r.content_text.trim();
      if (!bestCategory && r.category?.trim()) bestCategory = r.category.trim();
      if (!bestSummary && r.summary?.trim()) bestSummary = r.summary.trim();
    }

    return { bestTitle, bestContent, bestCategory, bestSummary };
  }, [successResults]);

  const imageFileKeys = useMemo(
    () => new Set(files.filter((f) => f.type.startsWith("image/")).map(fkey)),
    [files],
  );

  const allRecognitionDone = useMemo(() => {
    if (imageFileKeys.size === 0) return false;
    for (const k of imageFileKeys) {
      if (!aiRecogs[k] && !aiLoading[k]) return false;
      if (aiLoading[k]) return false;
    }
    return true;
  }, [imageFileKeys, aiRecogs, aiLoading]);

  useEffect(() => {
    const { bestTitle, bestContent, bestCategory, bestSummary } = aggregated;

    if (!userEdited.title) {
      const fillTitle = bestTitle || bestSummary;
      if (fillTitle) setTitle(fillTitle.slice(0, 100));
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

  const runRecognition = useCallback(async (file: File) => {
    const key = fkey(file);
    setAiLoading((p) => {
      if (p[key]) return p;
      return { ...p, [key]: true };
    });
    try {
      const res = await quickRecognize(file);
      setAiRecogs((p) => ({ ...p, [key]: res }));
    } catch {
      setAiRecogs((p) => ({ ...p, [key]: { success: false, slot_type: "unknown", category: "", summary: "", error: "识别失败" } }));
    } finally {
      setAiLoading((p) => ({ ...p, [key]: false }));
    }
  }, []);

  useEffect(() => {
    const imgCount = files.filter((f) => f.type.startsWith("image/")).length;
    const hasVideo = files.some((f) => f.type.startsWith("video/"));
    if (files.length === 0) setAiSuggestion("");
    else if (imgCount === 1 && !hasVideo) setAiSuggestion("建议再上传正文截图或评论区截图，让诊断更全面");
    else if (imgCount === 2) setAiSuggestion("不错！可以继续补充主页截图和评论区截图");
    else if (imgCount >= 3) setAiSuggestion("图片充足，可以直接开始诊断了");
    else if (hasVideo && imgCount === 0) setAiSuggestion("建议再补一张封面截图，提升视觉维度分析效果");
    else setAiSuggestion("");
  }, [files]);

  useEffect(() => {
    if (files.length === 0) {
      setAiRecogs({});
      setAiLoading({});
      setUserEdited({ title: false, content: false, category: false });
      setTitle("");
      setContent("");
      setCategory("food");
      setWizardStep(0);
      setWizardHold(false);
    }
  }, [files.length]);

  /** 移动端：有素材且未暂停时，延迟自动进入第二步 */
  useEffect(() => {
    if (isDesktop) return;
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    if (files.length === 0 || wizardHold || wizardStep !== 0) return;
    autoTimerRef.current = setTimeout(() => {
      setWizardStep(1);
      autoTimerRef.current = null;
    }, 480);
    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [files.length, wizardHold, wizardStep, isDesktop]);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      setFiles(newFiles);
      for (const f of newFiles) {
        const key = fkey(f);
        if (f.type.startsWith("image/") && !aiRecogs[key]) {
          runRecognition(f);
        }
      }
    },
    [runRecognition, aiRecogs],
  );

  const canSubmit = files.length > 0 && title.trim().length > 0;

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

  const imageCount = files.filter((f) => f.type.startsWith("image/")).length;
  const guideSteps = ["上传封面", "补充正文", "补充主页", "补充评论区"];
  const currentGuideIndex = Math.min(imageCount, guideSteps.length - 1);

  const handleWizardBack = () => {
    setWizardStep(0);
    setWizardHold(true);
  };

  const handleWizardContinue = () => {
    setWizardHold(false);
    setWizardStep(1);
  };

  const guideCard = (
    <Box sx={{ p: { xs: 1.5, md: 1.25 }, borderRadius: "12px", bgcolor: "#fff5f6", border: "1px solid #ffe3e8", flexShrink: 0 }}>
      <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#ff2442", fontWeight: 600, mb: { xs: 1, md: 0.75 } }}>
        引导：按截图类型补齐素材，识别更准确
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {guideSteps.map((step, idx) => (
          <Chip
            key={step}
            size="small"
            label={step}
            sx={{
              bgcolor: idx <= currentGuideIndex ? "#ff2442" : "#fff",
              color: idx <= currentGuideIndex ? "#fff" : "#999",
              border: idx <= currentGuideIndex ? "none" : "1px solid #eee",
              fontSize: { xs: 11, md: 10 },
              height: { md: 22 },
              fontWeight: idx === currentGuideIndex ? 700 : 500,
            }}
          />
        ))}
      </Box>
      <Typography sx={{ mt: { xs: 1, md: 0.75 }, fontSize: { xs: 12, md: 11 }, color: "#666" }}>
        当前建议：{guideSteps[currentGuideIndex]}
      </Typography>
    </Box>
  );

  const aiPanel = (
    (anyLoading || successResults.length > 0 || allFailed || aiSuggestion) && (
      <Box sx={{ p: { xs: 2, md: 1.25 }, borderRadius: "12px", bgcolor: allFailed ? "#fffbeb" : "#fafbfc", border: `1px solid ${allFailed ? "#fde68a" : "#f0f0f0"}`, flexShrink: 0 }}>
        {anyLoading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: successResults.length > 0 ? 1 : 0 }}>
            <CircularProgress size={14} sx={{ color: "#ff2442" }} />
            <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#999" }}>AI 正在识别标题、正文、垂类...</Typography>
          </Box>
        )}
        {allFailed && (
          <Box>
            <Typography sx={{ fontSize: { xs: 12, md: 11 }, fontWeight: 600, color: "#92400e", mb: 0.5 }}>
              当前素材的 AI 快识全部失败
            </Typography>
            <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#a16207", lineHeight: 1.65 }}>
              多数是「后端没开」或「Key 失效」：请先保证本机 <code style={{ fontSize: "0.9em" }}>uvicorn</code> 在 8000 端口运行（与前端 <code style={{ fontSize: "0.9em" }}>/api</code> 代理一致），再检查 <code style={{ fontSize: "0.9em" }}>backend/.env</code> 里的
              OPENAI_API_KEY。也可在开发者工具 Network 中查看 quick-recognize 是否 502/401。若暂时无法识别，可手动填标题后继续诊断。
            </Typography>
          </Box>
        )}
        {successResults.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: aiSuggestion ? 1 : 0 }}>
            {successResults.map((r, i) => (
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
        {aiSuggestion && !allFailed && (
          <Typography sx={{ fontSize: { xs: 12, md: 11 }, color: "#666", lineHeight: 1.5 }}>
            💡 {aiSuggestion}
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
          value={title}
          onChange={(e) => { setTitle(e.target.value); setUserEdited((p) => ({ ...p, title: true })); }}
          placeholder="上传图片后 AI 自动识别，也可手动输入"
          slotProps={{ htmlInput: { maxLength: 100 } }}
          helperText={autoFilled.title ? "✅ AI 已自动识别填充，可自行修改" : `${title.length}/100`}
        />
        {showWarnings && warnings.title && !title.trim() && !userEdited.title && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="small" />} sx={{ mt: 0.5, py: 0, fontSize: 11 }}>
            AI 未从图片中识别到笔记标题，请手动输入
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
          value={content}
          onChange={(e) => { setContent(e.target.value); setUserEdited((p) => ({ ...p, content: true })); }}
          placeholder="上传图片后 AI 自动提取正文，也可手动输入"
          helperText={autoFilled.content ? "✅ AI 已自动提取正文，可自行修改" : undefined}
        />
        {showWarnings && warnings.content && !content.trim() && !userEdited.content && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="small" />} sx={{ mt: 0.5, py: 0, fontSize: 11 }}>
            AI 未提取到正文，可上传正文截图或手动输入
          </Alert>
        )}
      </Box>
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: { xs: 1, md: 0.75 } }}>
          <Typography sx={{ fontSize: { xs: 13, md: 12 }, color: "#999", fontWeight: 500 }}>选择垂类</Typography>
          {autoFilled.category && (
            <Chip label="AI 已识别" size="small" sx={{ bgcolor: "#f0fdf4", color: "#16a34a", fontSize: 10, height: 20 }} />
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
        borderRadius: "12px",
        minHeight: { xs: 48, md: 44 },
        bgcolor: "#ff2442",
        "&:hover": { bgcolor: "#d91a36" },
        "&.Mui-disabled": { bgcolor: "#f0f0f0", color: "#bbb" },
        flexShrink: 0,
      }}
    >
      开始诊断
    </Button>
  );

  const stepHeader = (
    <Stepper activeStep={isDesktop ? 1 : wizardStep} alternativeLabel sx={{ mb: { xs: 2, md: 1.5 }, "& .MuiStepLabel-label": { fontSize: { md: 12 } } }}>
      {WIZARD_LABELS.map((label) => (
        <Step key={label}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );

  /** 桌面：双栏卡片，视口内展示，右侧表单区可滚动 */
  const desktopLayout = (
    <Box
      sx={{
        height: "100dvh",
        maxHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#f3f4f6",
        overflow: "hidden",
      }}
    >
      <Box sx={{ flexShrink: 0, px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
            <rect width="28" height="28" rx="7" fill="#ff2442" />
            <text x="14" y="19" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">Rx</text>
          </svg>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "1.05rem", fontWeight: 700, color: "#262626", lineHeight: 1.2 }}>薯医 NoteRx</Typography>
            <Typography sx={{ fontSize: "0.72rem", color: "#888", lineHeight: 1.2 }}>上传素材 → AI 预填 → 一键诊断</Typography>
          </Box>
        </Box>
        <Button
          startIcon={<HistoryOutlined sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/history")}
          size="small"
          sx={{ color: "#666", fontSize: 12, fontWeight: 500, flexShrink: 0, "&:hover": { color: "#262626" } }}
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
              borderRadius: "16px",
              border: "1px solid #e8e8e8",
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              minHeight: 0,
              bgcolor: "#fff",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}
          >
            {stepHeader}
            {guideCard}
            <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} compact />
            </Box>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              borderRadius: "16px",
              border: "1px solid #e8e8e8",
              p: 2,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              bgcolor: "#fff",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#262626", mb: 1, flexShrink: 0 }}>
              笔记信息
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
              {aiPanel}
              {formFields}
            </Box>
            <Box sx={{ pt: 1.5, flexShrink: 0 }}>{submitBtn}</Box>
          </Paper>
        </Box>
      </Box>

      <Typography sx={{ flexShrink: 0, textAlign: "center", pb: 1, fontSize: "0.65rem", color: "#ccc" }}>
        薯医 NoteRx · AI 诊断仅供参考
      </Typography>
    </Box>
  );

  /** 移动端：分步 + 自动进入第二步，可返回 */
  const mobileLayout = (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      sx={{ minHeight: "100dvh", bgcolor: "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", px: 2, py: 3, pb: 4 }}
    >
      <Box sx={{ width: "100%", maxWidth: 520, display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button
          startIcon={<HistoryOutlined sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/history")}
          sx={{ color: "#999", fontSize: 13, fontWeight: 500, "&:hover": { color: "#262626" } }}
        >
          历史记录
        </Button>
      </Box>

      <Box sx={{ textAlign: "center", mb: 2 }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#ff2442" />
            <text x="14" y="19" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">Rx</text>
          </svg>
          <Typography sx={{ fontSize: "1.35rem", fontWeight: 700, color: "#262626" }}>薯医 NoteRx</Typography>
        </Box>
        <Typography sx={{ fontSize: "0.82rem", color: "#999" }}>分步完成，上传后会自动进入下一步</Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 520,
          p: 2.5,
          borderRadius: "16px",
          border: "1px solid #f0f0f0",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        }}
      >
        {stepHeader}

        <AnimatePresence mode="wait">
          {wizardStep === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.22 }}
            >
              <Stack spacing={2}>
                {guideCard}
                <UploadZone files={files} onFilesChange={handleFilesChange} maxFiles={9} />
                <Typography sx={{ fontSize: 11, color: "#999", textAlign: "center" }}>
                  {files.length === 0 ? "请先上传至少一张图或一个视频" : wizardHold ? "可点下方按钮进入填写信息" : "即将自动进入「完善信息」…"}
                </Typography>
                {wizardHold && files.length > 0 && (
                  <Button variant="outlined" fullWidth onClick={handleWizardContinue} sx={{ borderColor: "#ff2442", color: "#ff2442" }}>
                    前往完善信息
                  </Button>
                )}
              </Stack>
            </motion.div>
          )}

          {wizardStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
            >
              <Stack spacing={2}>
                <Button
                  startIcon={<ArrowBackOutlined sx={{ fontSize: 18 }} />}
                  onClick={handleWizardBack}
                  sx={{ alignSelf: "flex-start", color: "#666", fontSize: 13, mb: -0.5 }}
                >
                  返回上传
                </Button>
                {aiPanel}
                {formFields}
                {submitBtn}
              </Stack>
            </motion.div>
          )}
        </AnimatePresence>
      </Paper>

      <Typography sx={{ mt: 3, fontSize: "0.72rem", color: "#ccc" }}>薯医 NoteRx · AI 诊断仅供参考</Typography>
    </Box>
  );

  return isDesktop ? desktopLayout : mobileLayout;
}
