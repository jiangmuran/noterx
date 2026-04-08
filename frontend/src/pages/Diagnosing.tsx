import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Typography } from "@mui/material";
import { diagnoseNote } from "../utils/api";
import type { DiagnoseResult } from "../utils/api";
import { saveHistory } from "../utils/api";
import { FALLBACK_REPORT } from "../utils/fallback";

const STEPS = [
  "解析笔记内容",
  "分析封面视觉",
  "对比垂类数据",
  "内容分析师诊断中",
  "视觉诊断师诊断中",
  "增长策略师诊断中",
  "用户模拟器运行中",
  "Agent 辩论交锋",
  "综合裁判评定",
  "生成诊断报告",
];

export default function Diagnosing() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = location.state as {
    title: string; content: string; tags: string; category: string; coverFile: File | null;
  } | null;

  const [step, setStep] = useState(0);
  const apiDone = useRef(false);
  const resultRef = useRef<{ report: unknown; isFallback: boolean } | null>(null);

  useEffect(() => {
    document.title = "诊断中... - 薯医 NoteRx";
    if (!params) { navigate("/"); return; }
    let cancelled = false;

    (async () => {
      try {
        const result = await diagnoseNote({
          title: params.title, content: params.content,
          category: params.category, tags: params.tags,
          coverImage: params.coverFile ?? undefined,
        });
        resultRef.current = { report: result, isFallback: false };
        saveHistory({
          title: params.title,
          category: params.category,
          report: result as DiagnoseResult,
        }).catch((e) => console.warn("保存历史记录失败", e));
      } catch (err) {
        console.warn("API 不可用，使用 fallback", err);
        resultRef.current = { report: FALLBACK_REPORT, isFallback: true };
      }
      apiDone.current = true;
    })();

    const timer = setInterval(() => {
      setStep((prev) => {
        if (apiDone.current && prev >= STEPS.length - 2) {
          clearInterval(timer);
          setTimeout(() => {
            if (!cancelled && resultRef.current)
              navigate("/report", { state: { report: resultRef.current.report, params, isFallback: resultRef.current.isFallback } });
          }, 600);
          return STEPS.length - 1;
        }
        if (prev >= STEPS.length - 1) return prev;
        if (!apiDone.current && prev >= STEPS.length - 2) return prev;
        return prev + 1;
      });
    }, 2800);

    return () => { cancelled = true; clearInterval(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!params) return null;

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <Box sx={{ position: "fixed", inset: 0, bgcolor: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Box sx={{ width: "100%", maxWidth: 360, px: 3, textAlign: "center" }}>
        {/* Animated loader */}
        <Box sx={{ mb: 3, display: "flex", justifyContent: "center" }}>
          <svg width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="#f0f0f0" strokeWidth="3" />
            <motion.circle
              cx="20" cy="20" r="16" fill="none" stroke="#ff2442" strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="100"
              animate={{ strokeDashoffset: [100, 0, 100], rotate: [0, 360, 720] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "center" }}
            />
          </svg>
        </Box>

        {/* Step label */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <Typography sx={{ fontSize: 15, color: "#262626", fontWeight: 500 }}>
              {STEPS[step]}
            </Typography>
          </motion.div>
        </AnimatePresence>

        {/* Progress bar */}
        <Box sx={{ mt: 3, mb: 1.5, height: 3, bgcolor: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
          <Box
            sx={{
              height: "100%",
              bgcolor: "#ff2442",
              borderRadius: 2,
              width: `${progress}%`,
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </Box>

        {/* Step counter + title */}
        <Typography sx={{ fontSize: 12, color: "#bbb" }}>
          {step + 1} / {STEPS.length}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "#bbb", mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {params.title || "截图识别中"}
        </Typography>
      </Box>
    </Box>
  );
}
