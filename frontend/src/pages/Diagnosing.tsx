import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { diagnoseNote } from "../utils/api";
import { FALLBACK_REPORT } from "../utils/fallback";
import DiagnoseAnimation from "../components/DiagnoseAnimation";

const STEPS = [
  { label: "解析笔记内容", icon: "📄", duration: 2000 },
  { label: "分析封面视觉", icon: "🎨", duration: 2500 },
  { label: "对比垂类数据", icon: "📊", duration: 2000 },
  { label: "内容Agent诊断中", icon: "📝", duration: 3000 },
  { label: "视觉Agent诊断中", icon: "👁️", duration: 3000 },
  { label: "增长Agent诊断中", icon: "📈", duration: 3000 },
  { label: "用户模拟Agent运行中", icon: "💬", duration: 3000 },
  { label: "Agent辩论交锋", icon: "⚔️", duration: 4000 },
  { label: "综合裁判评定", icon: "⚖️", duration: 3000 },
  { label: "生成诊断报告", icon: "📋", duration: 2000 },
];

/**
 * 诊断过程页
 */
export default function Diagnosing() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = location.state as {
    title: string;
    content: string;
    tags: string;
    category: string;
    coverFile: File | null;
  } | null;

  const [currentStep, setCurrentStep] = useState(0);
  const apiDone = useRef(false);
  const resultRef = useRef<{ report: unknown; isFallback: boolean } | null>(null);

  useEffect(() => {
    if (!params) {
      navigate("/");
      return;
    }

    let cancelled = false;

    const runDiagnosis = async () => {
      try {
        const result = await diagnoseNote({
          title: params.title,
          content: params.content,
          category: params.category,
          tags: params.tags,
          coverImage: params.coverFile ?? undefined,
        });
        resultRef.current = { report: result, isFallback: false };
      } catch (err) {
        console.warn("API 不可用，使用 fallback 数据", err);
        resultRef.current = { report: FALLBACK_REPORT, isFallback: true };
      }
      apiDone.current = true;
    };

    runDiagnosis();

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (apiDone.current && prev >= STEPS.length - 2) {
          clearInterval(timer);
          setTimeout(() => {
            if (!cancelled && resultRef.current) {
              navigate("/report", {
                state: {
                  report: resultRef.current.report,
                  params,
                  isFallback: resultRef.current.isFallback,
                },
              });
            }
          }, 800);
          return STEPS.length - 1;
        }
        if (prev >= STEPS.length - 1) return prev;
        if (!apiDone.current && prev >= STEPS.length - 2) return prev;
        return prev + 1;
      });
    }, 2800);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!params) return null;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #ecfdf5 0%, #ffffff 50%, #f0fdfa 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box sx={{ maxWidth: 440, width: "100%", mx: 2 }}>
        <Card sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
          <CardContent>
            <DiagnoseAnimation currentStep={currentStep} steps={STEPS} />
            <Box sx={{ mt: 4 }}>
              <Typography variant="body2" color="text.secondary">
                正在诊断
              </Typography>
              <Typography
                variant="subtitle1"
                fontWeight={600}
                sx={{ mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", px: 2 }}
              >
                「{params.title || "截图识别中..."}」
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
