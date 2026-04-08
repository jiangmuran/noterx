import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Stethoscope, FileText, ImageIcon, BarChart3, MessageCircle, Users, Eye, Sparkles, Scale } from "../components/Icons";

const STEPS = [
  { id: "parse", label: "解析笔记内容", icon: FileText, duration: 2000 },
  { id: "visual", label: "分析封面视觉", icon: ImageIcon, duration: 2500 },
  { id: "baseline", label: "对比垂类数据", icon: BarChart3, duration: 2000 },
  { id: "content", label: "内容Agent诊断", icon: MessageCircle, duration: 3000 },
  { id: "visual_agent", label: "视觉Agent诊断", icon: Eye, duration: 3000 },
  { id: "growth", label: "增长Agent诊断", icon: Users, duration: 3000 },
  { id: "user_sim", label: "用户模拟Agent", icon: Sparkles, duration: 3000 },
  { id: "debate", label: "Agent辩论交锋", icon: MessageCircle, duration: 4000 },
  { id: "judge", label: "综合裁判评定", icon: Scale, duration: 3000 },
  { id: "report", label: "生成诊断报告", icon: FileText, duration: 2000 },
];

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
  const [progress, setProgress] = useState(0);
  const apiDone = useRef(false);

  useEffect(() => {
    if (!params) {
      navigate("/");
      return;
    }

    let cancelled = false;

    // Simulate API call
    const runDiagnosis = async () => {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      apiDone.current = true;
    };

    runDiagnosis();

    const totalDuration = STEPS.reduce((sum, s) => sum + s.duration, 0);
    const startTime = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(newProgress);

      const newStep = Math.min(
        STEPS.length - 1,
        Math.floor((elapsed / totalDuration) * STEPS.length)
      );
      setCurrentStep(newStep);

      if (apiDone.current && newStep >= STEPS.length - 1) {
        clearInterval(timer);
        setTimeout(() => {
          if (!cancelled) {
            navigate("/report", {
              state: {
                report: generateMockReport(),
                params,
                isFallback: true,
              },
            });
          }
        }, 1000);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [navigate, params]);

  if (!params) return null;

  const currentStepData = STEPS[currentStep];
  const CurrentIcon = currentStepData.icon;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card variant="elevated">
          <CardContent className="p-8 text-center">
            {/* Logo Animation */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 bg-[#FF2957]/20 rounded-3xl animate-pulse-ring" />
              <div className="absolute inset-2 bg-[#FF2957]/30 rounded-2xl animate-pulse-ring" style={{ animationDelay: "0.3s" }} />
              <div className="relative w-full h-full bg-gradient-to-br from-[#FF2957] to-[#e61e4b] rounded-2xl flex items-center justify-center shadow-lg">
                <Stethoscope className="text-white" size={36} />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl font-semibold mb-2">正在诊断</h2>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-8 truncate px-4">
              「{params.title || "未命名笔记"}」
            </p>

            {/* Progress Bar */}
            <div className="mb-8">
              <Progress value={progress} size="lg" color="accent" />
              <div className="mt-2 text-xs text-neutral-400">{Math.round(progress)}%</div>
            </div>

            {/* Current Step */}
            <div className="relative">
              <div className="flex items-center justify-center gap-3 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl">
                <div className="w-10 h-10 bg-[#FF2957]/10 rounded-xl flex items-center justify-center">
                  <CurrentIcon size={20} className="text-[#FF2957]" />
                </div>
                <span className="font-medium">{currentStepData.label}</span>
              </div>

              {/* Step Indicators */}
              <div className="flex justify-center gap-1.5 mt-4">
                {STEPS.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                      idx <= currentStep ? "bg-[#FF2957] w-3" : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Agent Visualization */}
            <div className="mt-8 grid grid-cols-5 gap-2">
              {[
                { label: "内容", color: "#0055FF", active: currentStep >= 3 },
                { label: "视觉", color: "#FF2957", active: currentStep >= 4 },
                { label: "增长", color: "#00D4AA", active: currentStep >= 5 },
                { label: "用户", color: "#FFC72C", active: currentStep >= 6 },
                { label: "裁判", color: "#8B5CF6", active: currentStep >= 8 },
              ].map((agent) => (
                <div
                  key={agent.label}
                  className={`p-2 rounded-lg text-xs font-medium transition-all duration-300 ${
                    agent.active
                      ? "text-white shadow-md"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                  }`}
                  style={agent.active ? { backgroundColor: agent.color } : undefined}
                >
                  {agent.label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Mock report generator
function generateMockReport() {
  return {
    overall_score: 78,
    grade: "B+",
    radar_data: [
      { name: "标题吸引力", value: 82 },
      { name: "内容质量", value: 75 },
      { name: "视觉表现", value: 88 },
      { name: "标签策略", value: 70 },
      { name: "互动潜力", value: 76 },
    ],
    suggestions: [
      { type: "title", content: "标题可以更加情绪化，尝试使用数字和疑问句式", priority: "high" },
      { type: "content", content: "正文前3行需要更强的钩子，建议直接给出核心价值", priority: "high" },
      { type: "tags", content: "标签数量偏少，建议增加3-5个长尾标签", priority: "medium" },
      { type: "cover", content: "封面文字占比适中，但主标题可以更加醒目", priority: "medium" },
    ],
    optimized_title: "3个月涨粉10万！这个美食博主做对了什么？",
    optimized_content: "开头直接给出结果，然后分点阐述方法论...",
    cover_direction: {
      layout: "三分构图，主体偏右",
      color_scheme: "暖色调，增加食欲感",
      text_style: "粗体大字，对比强烈",
      tips: ["增加人物元素提升亲和力", "使用箭头引导视线"],
    },
    agent_opinions: [
      { agent: "内容Agent", stance: "positive", content: "内容结构完整，信息密度适中" },
      { agent: "视觉Agent", stance: "positive", content: "封面构图良好，色彩和谐" },
      { agent: "增长Agent", stance: "neutral", content: "标签策略有待优化" },
      { agent: "用户Agent", stance: "positive", content: "目标受众会产生共鸣" },
    ],
    debate_summary: "各Agent一致认为内容质量达标，视觉表现优秀，主要分歧在于标签策略的优化空间",
    debate_timeline: [
      { step: 1, agent: "内容Agent", action: "positive", content: "内容结构评分：8.2/10" },
      { step: 2, agent: "视觉Agent", action: "positive", content: "视觉评分：8.8/10" },
      { step: 3, agent: "增长Agent", action: "neutral", content: "标签策略评分：7.0/10" },
      { step: 4, agent: "用户Agent", action: "positive", content: "用户共鸣评分：7.6/10" },
    ],
    simulated_comments: [
      { type: "positive", content: "这个分享太实用了，收藏了！", confidence: 0.85 },
      { type: "question", content: "请问具体是怎么操作的？", confidence: 0.72 },
      { type: "neutral", content: "看起来不错，下次试试", confidence: 0.68 },
    ],
  };
}
