import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Stack, Chip, CircularProgress,
  Alert, TextField, LinearProgress, IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ArticleIcon from "@mui/icons-material/Article";
import PersonIcon from "@mui/icons-material/Person";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import VideocamIcon from "@mui/icons-material/Videocam";
import { motion, AnimatePresence } from "framer-motion";
import {
  quickRecognize,
  deepAnalyze,
} from "../utils/api";
import type {
  SlotType,
  QuickRecognizeResult,
  DeepAnalysisResult,
} from "../utils/api";

type Scenario = "pre_publish" | "post_publish";

interface SlotConfig {
  key: SlotType;
  label: string;
  desc: string;
  icon: React.ReactNode;
  required: boolean;
}

const SLOTS: SlotConfig[] = [
  { key: "cover", label: "封面截图", desc: "用于识别视觉风格与首图吸引力", icon: <PhotoCameraIcon />, required: true },
  { key: "content", label: "正文内容截图", desc: "包含文字描述、标签等", icon: <ArticleIcon />, required: true },
  { key: "profile", label: "主页截图", desc: "定位账号权重及博主画像", icon: <PersonIcon />, required: false },
  { key: "comments", label: "评论区截图", desc: "分析用户舆情及互动情况", icon: <ChatBubbleIcon />, required: false },
];

const LINK_REGEX = /https?:\/\/\S+/gi;
const ORDERED_SLOT_KEYS: SlotType[] = ["cover", "content", "profile", "comments"];
const DRAFT_KEY = "noterx_screenshot_draft_v1";

/**
 * 截图多维度分析页
 */
export default function ScreenshotAnalysis() {
  const navigate = useNavigate();

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [recognitions, setRecognitions] = useState<Record<string, QuickRecognizeResult>>({});
  const [recognizing, setRecognizing] = useState<Record<string, boolean>>({});
  const [recognitionErrors, setRecognitionErrors] = useState<Record<string, string>>({});
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [extraText, setExtraText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<DeepAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const slotCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /**
   * 恢复可持久化的草稿信息（场景与补充文本）。
   * 文件对象出于浏览器安全限制无法跨刷新恢复。
   */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { scenario?: Scenario; extraText?: string };
      if (draft.scenario) setScenario(draft.scenario);
      if (typeof draft.extraText === "string") setExtraText(draft.extraText);
    } catch {
      // ignore
    }
  }, []);

  /** 持久化用户输入草稿，避免返回后重填。 */
  useEffect(() => {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ scenario, extraText }),
      );
    } catch {
      // ignore
    }
  }, [scenario, extraText]);

  const currentGuideIndex = ORDERED_SLOT_KEYS.findIndex((key) => !files[key]);

  /** 上传成功后自动滚动到下一步，降低操作中断感。 */
  useEffect(() => {
    if (!scenario || currentGuideIndex < 0) return;
    const nextKey = ORDERED_SLOT_KEYS[currentGuideIndex];
    const nextCard = slotCardRefs.current[nextKey];
    if (nextCard) {
      nextCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scenario, currentGuideIndex]);

  const handleFile = useCallback(async (slot: SlotType, file: File) => {
    setFiles((p) => ({ ...p, [slot]: file }));
    const reader = new FileReader();
    reader.onload = (e) => setPreviews((p) => ({ ...p, [slot]: e.target?.result as string }));
    reader.readAsDataURL(file);

    setRecognizing((p) => ({ ...p, [slot]: true }));
    try {
      const res = await quickRecognize(file, slot);
      setRecognitions((p) => ({ ...p, [slot]: res }));
      setRecognitionErrors((p) => {
        const n = { ...p };
        delete n[slot];
        return n;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "快速识别失败，请重试";
      setRecognitionErrors((p) => ({ ...p, [slot]: msg }));
    } finally {
      setRecognizing((p) => ({ ...p, [slot]: false }));
    }
  }, []);

  /** 重试单张截图的快识调用。 */
  const retryRecognize = useCallback(async (slot: SlotType) => {
    const file = files[slot];
    if (!file) return;
    setRecognizing((p) => ({ ...p, [slot]: true }));
    try {
      const res = await quickRecognize(file, slot);
      setRecognitions((p) => ({ ...p, [slot]: res }));
      setRecognitionErrors((p) => {
        const n = { ...p };
        delete n[slot];
        return n;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "快速识别失败，请重试";
      setRecognitionErrors((p) => ({ ...p, [slot]: msg }));
    } finally {
      setRecognizing((p) => ({ ...p, [slot]: false }));
    }
  }, [files]);

  const removeFile = useCallback((slot: string) => {
    setFiles((p) => { const n = { ...p }; delete n[slot]; return n; });
    setPreviews((p) => { const n = { ...p }; delete n[slot]; return n; });
    setRecognitions((p) => { const n = { ...p }; delete n[slot]; return n; });
    setRecognitionErrors((p) => { const n = { ...p }; delete n[slot]; return n; });
  }, []);

  const filledCount = Object.values(files).filter(Boolean).length;
  const canSubmit = filledCount >= 1 && !analyzing;
  const visibleGuideCount = currentGuideIndex === -1 ? ORDERED_SLOT_KEYS.length : currentGuideIndex + 1;
  const nextSlotLabel = currentGuideIndex === -1
    ? ""
    : (SLOTS.find((s) => s.key === ORDERED_SLOT_KEYS[currentGuideIndex])?.label ?? "下一步");
  const submitLabel = currentGuideIndex === -1
    ? "开始深度分析"
    : (filledCount === 0 ? `继续上传（还差${nextSlotLabel}）` : `开始深度分析（建议补${nextSlotLabel}）`);

  const handleSubmit = async () => {
    if (!scenario) return;
    setAnalyzing(true);
    setError("");
    try {
      const res = await deepAnalyze({
        scenario,
        cover: files.cover ?? undefined,
        contentImg: files.content ?? undefined,
        profile: files.profile ?? undefined,
        comments: files.comments ?? undefined,
        video: videoFile ?? undefined,
        extraText: extraText.replace(LINK_REGEX, ""),
      });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  /* ====== 场景选择 ====== */
  if (!scenario) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", px: 2, py: { xs: 5, md: 8 } }}>
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Typography sx={{ fontSize: "1.4rem", fontWeight: 700, color: "#262626" }}>选择分析模式</Typography>
          <Typography sx={{ fontSize: "0.85rem", color: "#999", mt: 0.5 }}>通过截图进行多维度内容分析</Typography>
        </Box>
        <Stack spacing={2} sx={{ width: "100%", maxWidth: 440 }}>
          {([
            { val: "pre_publish" as Scenario, title: "发布前分析", desc: "内容打磨阶段 — 对草稿/预览进行 AI 预校验", color: "#2563eb" },
            { val: "post_publish" as Scenario, title: "发布后分析", desc: "已发布内容 — 同步流量数据进行深度复盘", color: "#16a34a" },
          ]).map((s) => (
            <Box
              key={s.val}
              onClick={() => setScenario(s.val)}
              sx={{
                p: 3, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #f0f0f0",
                cursor: "pointer", transition: "all 0.15s",
                "&:hover": { borderColor: s.color, boxShadow: `0 0 0 1px ${s.color}20` },
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: 16, color: "#262626" }}>{s.title}</Typography>
              <Typography sx={{ fontSize: 13, color: "#999", mt: 0.5 }}>{s.desc}</Typography>
            </Box>
          ))}
        </Stack>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/app")} sx={{ mt: 4, color: "#999" }}>
          返回首页
        </Button>
      </Box>
    );
  }

  /* ====== 结果展示 ====== */
  if (result) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", pb: 6 }}>
        <Box sx={{ position: "sticky", top: 0, zIndex: 10, bgcolor: "#fff", borderBottom: "1px solid #f0f0f0" }}>
          <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => { setResult(null); }} size="small" sx={{ color: "#262626" }}>返回</Button>
            <Typography sx={{ fontWeight: 700, color: "#262626", fontSize: 16 }}>分析结果</Typography>
            <Box sx={{ width: 64 }} />
          </Box>
        </Box>
        <Box sx={{ maxWidth: 720, mx: "auto", px: 2, mt: 3 }}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <Stack spacing={2}>
              {/* 综合信息 */}
              <Box sx={{ p: 3, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #f0f0f0" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 16, color: "#262626" }}>{result.overall.scenario}</Typography>
                  <Chip label={`完整度 ${result.overall.completeness}%`} size="small"
                    sx={{ bgcolor: result.overall.completeness >= 75 ? "#dcfce7" : "#fef3c7", color: result.overall.completeness >= 75 ? "#16a34a" : "#d97706", fontWeight: 600 }}
                  />
                </Box>
                <LinearProgress variant="determinate" value={result.overall.completeness} sx={{ height: 6, borderRadius: 3, mb: 2, bgcolor: "#f0f0f0", "& .MuiLinearProgress-bar": { bgcolor: result.overall.completeness >= 75 ? "#16a34a" : "#d97706", borderRadius: 3 } }} />
                {result.overall.tips.length > 0 && (
                  <Stack spacing={0.5}>
                    {result.overall.tips.map((t, i) => (
                      <Typography key={i} sx={{ fontSize: 13, color: "#999" }}>· {t}</Typography>
                    ))}
                  </Stack>
                )}
              </Box>

              {/* 各维度分析 */}
              {Object.entries(result.analyses).map(([slot, data]) => {
                const config = SLOTS.find((s) => s.key === slot);
                const hasError = data && typeof data === "object" && "error" in data;
                return (
                  <Box key={slot} sx={{ p: 3, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #f0f0f0" }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 1.5 }}>
                      {config?.label || slot}
                    </Typography>
                    {hasError ? (
                      <Alert severity="error" sx={{ borderRadius: "12px" }}>{String((data as Record<string, unknown>).error)}</Alert>
                    ) : (
                      <Box sx={{ p: 2, borderRadius: "12px", bgcolor: "#fafafa", border: "1px solid #f5f5f5" }}>
                        {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
                          <Box key={k} sx={{ mb: 1 }}>
                            <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: "#999" }}>
                              {k}：
                            </Typography>
                            <Typography component="span" sx={{ fontSize: 13, color: "#505050" }}>
                              {Array.isArray(v) ? (v as string[]).join("、") : String(v)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                );
              })}

              {/* 视频信息 */}
              {result.video_info && (
                <Box sx={{ p: 3, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #f0f0f0" }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 15, color: "#262626", mb: 1 }}>视频信息</Typography>
                  <Typography sx={{ fontSize: 13, color: "#666" }}>
                    {result.video_info.filename} ({result.video_info.size_mb} MB)
                  </Typography>
                </Box>
              )}

              <Button variant="contained" fullWidth onClick={() => navigate("/app")}
                sx={{ py: 1.4, fontSize: "0.95rem", fontWeight: 600, borderRadius: "12px", bgcolor: "#ff2442", "&:hover": { bgcolor: "#d91a36" } }}
              >
                返回首页
              </Button>
            </Stack>
          </motion.div>
        </Box>
      </Box>
    );
  }

  /* ====== 上传界面 ====== */
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", pb: 6 }}>
      {/* 顶栏 */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 10, bgcolor: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setScenario(null)} size="small" sx={{ color: "#262626" }}>
            返回
          </Button>
          <Typography sx={{ fontWeight: 700, color: "#262626", fontSize: 16 }}>
            {scenario === "pre_publish" ? "发布前分析" : "发布后分析"}
          </Typography>
          <Box sx={{ width: 64 }} />
        </Box>
      </Box>

      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, mt: 3 }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <Stack spacing={2}>
            <Box sx={{ p: 2, borderRadius: "14px", bgcolor: "#fff", border: "1px solid #f0f0f0" }}>
              <Typography sx={{ fontSize: 13, color: "#666", mb: 1 }}>
                业务流程：选择模式 → 上传引导（封面/内容/主页/评论）→ 单图 AI 快识（主题标签）→ 深度分析
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {ORDERED_SLOT_KEYS.map((key, idx) => {
                  const done = Boolean(files[key]);
                  const active = idx === currentGuideIndex || (currentGuideIndex === -1 && idx === ORDERED_SLOT_KEYS.length - 1);
                  const label = SLOTS.find((s) => s.key === key)?.label ?? key;
                  return (
                    <Chip
                      key={key}
                      label={`${idx + 1}. ${label}`}
                      size="small"
                      sx={{
                        bgcolor: done ? "#f0fdf4" : active ? "#fff0f1" : "#f5f5f5",
                        color: done ? "#16a34a" : active ? "#ff2442" : "#999",
                        fontWeight: done || active ? 600 : 500,
                      }}
                    />
                  );
                })}
              </Box>
            </Box>

            {/* 截图上传卡片 */}
            {SLOTS.filter((_, idx) => idx < visibleGuideCount).map((slot, idx) => {
              const file = files[slot.key];
              const preview = previews[slot.key];
              const recog = recognitions[slot.key];
              const isRecog = recognizing[slot.key];
              const recogError = recognitionErrors[slot.key];
              const isLocked = idx > 0 && !files[ORDERED_SLOT_KEYS[idx - 1]];

              return (
                <Box
                  key={slot.key}
                  ref={(el: HTMLDivElement | null) => { slotCardRefs.current[slot.key] = el; }}
                  sx={{ p: 2.5, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #f0f0f0" }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ color: "#ff2442", display: "flex" }}>{slot.icon}</Box>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 14, color: "#262626" }}>{slot.label}</Typography>
                        <Chip label={`步骤 ${idx + 1}`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: "#f5f5f5", color: "#666" }} />
                        {slot.required && <Chip label="推荐" size="small" sx={{ height: 20, fontSize: 11, bgcolor: "#fff0f1", color: "#ff2442" }} />}
                      </Box>
                      <Typography sx={{ fontSize: 12, color: "#999" }}>{slot.desc}</Typography>
                    </Box>
                  </Box>

                  <AnimatePresence mode="wait">
                    {file && preview ? (
                      <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        <Box sx={{ position: "relative", display: "inline-block" }}>
                          <Box component="img" src={preview} alt={slot.label}
                            sx={{ maxHeight: 160, maxWidth: "100%", borderRadius: "12px", display: "block", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                          />
                          <IconButton size="small" onClick={() => removeFile(slot.key)}
                            sx={{ position: "absolute", top: -8, right: -8, bgcolor: "#ff6b6b", color: "#fff", width: 24, height: 24, "&:hover": { bgcolor: "#e55a5a" } }}
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>

                        {/* AI 识别反馈 */}
                        <Box sx={{ mt: 1.5 }}>
                          {isRecog ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <CircularProgress size={14} sx={{ color: "#999" }} />
                              <Typography sx={{ fontSize: 12, color: "#999" }}>AI 识别中...</Typography>
                            </Box>
                          ) : recog ? (
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
                              <CheckCircleIcon sx={{ fontSize: 16, color: "#16a34a" }} />
                              <Typography sx={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>主题标签</Typography>
                              {recog.category && (
                                <Chip label={recog.category} size="small" sx={{ height: 22, fontSize: 11, bgcolor: "#f0fdf4", color: "#16a34a", fontWeight: 600 }} />
                              )}
                              {recog.summary && (
                                <Typography sx={{ fontSize: 12, color: "#666" }}>{recog.summary}</Typography>
                              )}
                            </Box>
                          ) : recogError ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                              <Typography sx={{ fontSize: 12, color: "#dc2626" }}>识别失败：{recogError}</Typography>
                              <Button size="small" onClick={() => retryRecognize(slot.key)} sx={{ minWidth: 0, px: 1 }}>
                                重试
                              </Button>
                            </Box>
                          ) : null}
                        </Box>
                      </motion.div>
                    ) : (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Box
                          onClick={() => {
                            if (!isLocked) inputRefs.current[slot.key]?.click();
                          }}
                          sx={{
                            border: "2px dashed #e0e0e0", borderRadius: "12px",
                            py: 3, display: "flex", flexDirection: "column", alignItems: "center",
                            cursor: "pointer", transition: "all 0.15s",
                            opacity: isLocked ? 0.5 : 1,
                            pointerEvents: isLocked ? "none" : "auto",
                            "&:hover": { borderColor: "#ff2442", bgcolor: "#fff5f6" },
                          }}
                        >
                          <CloudUploadIcon sx={{ fontSize: 28, color: "#ccc" }} />
                          <Typography sx={{ fontSize: 13, color: "#999", mt: 0.5 }}>
                            {isLocked ? "请先完成上一步上传" : `点击上传${slot.label}`}
                          </Typography>
                        </Box>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <input
                    ref={(el) => { inputRefs.current[slot.key] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(slot.key, f);
                      e.target.value = "";
                    }}
                  />
                </Box>
              );
            })}

            {/* 视频上传 */}
            <Box sx={{ p: 2.5, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #f0f0f0" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                <Box sx={{ color: "#ff2442", display: "flex" }}><VideocamIcon /></Box>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: 14, color: "#262626" }}>视频录屏</Typography>
                  <Typography sx={{ fontSize: 12, color: "#999" }}>可选 — 上传完整视频录屏（最大 100MB）</Typography>
                </Box>
              </Box>
              {videoFile ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: "10px", bgcolor: "#fafafa", border: "1px solid #f0f0f0" }}>
                  <VideocamIcon sx={{ fontSize: 20, color: "#666" }} />
                  <Typography sx={{ fontSize: 13, color: "#262626", flex: 1 }}>
                    {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)
                  </Typography>
                  <IconButton size="small" onClick={() => setVideoFile(null)} sx={{ color: "#999" }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              ) : (
                <Box
                  onClick={() => videoInputRef.current?.click()}
                  sx={{
                    border: "2px dashed #e0e0e0", borderRadius: "12px", py: 2.5,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    cursor: "pointer", "&:hover": { borderColor: "#ff2442", bgcolor: "#fff5f6" },
                  }}
                >
                  <CloudUploadIcon sx={{ fontSize: 24, color: "#ccc" }} />
                  <Typography sx={{ fontSize: 12, color: "#999", mt: 0.5 }}>点击上传视频</Typography>
                </Box>
              )}
              <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setVideoFile(f); if (e.target) e.target.value = ""; }}
              />
            </Box>

            {/* 额外文字说明 */}
            <Box sx={{ p: 2.5, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #f0f0f0" }}>
              <Typography sx={{ fontWeight: 600, fontSize: 14, color: "#262626", mb: 1 }}>额外说明（可选）</Typography>
              <TextField
                fullWidth multiline rows={3}
                placeholder="输入补充说明（链接会被自动过滤）"
                value={extraText}
                onChange={(e) => setExtraText(e.target.value.replace(LINK_REGEX, ""))}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
              />
            </Box>

            {error && <Alert severity="error" sx={{ borderRadius: "12px" }}>{error}</Alert>}

            {/* 提交 */}
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography sx={{ fontSize: 13, color: "#999", flex: 1, alignSelf: "center" }}>
                已上传 {filledCount}/4 张截图
                {videoFile ? " + 视频" : ""}
              </Typography>
              <Button
                variant="contained" disabled={!canSubmit} onClick={handleSubmit}
                sx={{
                  px: 4, py: 1.4, fontSize: "0.95rem", fontWeight: 600, borderRadius: "12px",
                  bgcolor: "#ff2442", "&:hover": { bgcolor: "#d91a36" },
                  "&.Mui-disabled": { bgcolor: "#f0f0f0", color: "#bbb" },
                }}
              >
                {analyzing ? <CircularProgress size={22} color="inherit" /> : submitLabel}
              </Button>
            </Box>
          </Stack>
        </motion.div>
      </Box>
    </Box>
  );
}
