import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  ArrowLeft, Copy, Check, Download, TrendingUp,
  MessageCircle, Users, Eye, Sparkles, Scale,
  Stethoscope, AlertCircle
} from "../components/Icons";
import { useState } from "react";

interface ReportData {
  overall_score: number;
  grade: string;
  radar_data: { name: string; value: number }[];
  suggestions: { type: string; content: string; priority: string }[];
  optimized_title?: string;
  optimized_content?: string;
  cover_direction?: {
    layout: string;
    color_scheme: string;
    text_style: string;
    tips: string[];
  };
  agent_opinions: { agent: string; stance: string; content: string }[];
  debate_summary: string;
  debate_timeline: { step: number; agent: string; action: string; content: string }[];
  simulated_comments: { type: string; content: string; confidence: number }[];
}

export default function Report() {
  const location = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);

  const state = location.state as {
    report: ReportData;
    params: { title: string; category: string };
    isFallback?: boolean;
  } | null;

  if (!state) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-900 flex items-center justify-center">
        <Card className="text-center p-8">
          <p className="text-neutral-500 dark:text-neutral-400 mb-4">暂无诊断数据</p>
          <Button onClick={() => navigate("/")}>返回首页</Button>
        </Card>
      </div>
    );
  }

  const { report, params, isFallback } = state;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "text-[#00D4AA]";
    if (grade.startsWith("B")) return "text-[#0055FF]";
    if (grade.startsWith("C")) return "text-[#FFC72C]";
    return "text-[#FF2957]";
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#00D4AA";
    if (score >= 60) return "#0055FF";
    if (score >= 40) return "#FFC72C";
    return "#FF2957";
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft size={18} className="mr-1" />
            返回
          </Button>
          <div className="flex items-center gap-2">
            <Stethoscope size={20} className="text-[#FF2957]" />
            <span className="font-semibold">诊断报告</span>
          </div>
          <Button variant="ghost" size="sm">
            <Download size={18} className="mr-1" />
            导出
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {isFallback && (
          <div className="p-4 bg-[#FFC72C]/10 border border-[#FFC72C]/20 rounded-xl flex items-center gap-3">
            <AlertCircle size={20} className="text-[#FFC72C]" />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">当前展示的是演示数据</span>
          </div>
        )}

        {/* Score Card */}
        <Card variant="elevated">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              {/* Score Circle */}
              <div className="relative">
                <svg className="w-32 h-32 -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-neutral-200 dark:text-neutral-700"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke={getScoreColor(report.overall_score)}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(report.overall_score / 100) * 351.86} 351.86`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-bold ${getGradeColor(report.grade)}`}>{report.grade}</span>
                  <span className="text-sm text-neutral-500">{report.overall_score}分</span>
                </div>
              </div>

              {/* Title & Summary */}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-xl font-semibold mb-2">「{params.title || "未命名笔记"}」</h1>
                <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-4">
                  综合诊断结果：内容质量良好，视觉表现优秀，建议优化标签策略
                </p>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                  <Badge variant="success">内容达标</Badge>
                  <Badge variant="accent">视觉优秀</Badge>
                  <Badge variant="warning">标签待优化</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={20} className="text-[#0055FF]" />
              五维诊断分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {report.radar_data.map((item) => (
                <div key={item.name} className="text-center p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl">
                  <div className="text-2xl font-bold mb-1" style={{ color: getScoreColor(item.value) }}>
                    {item.value}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{item.name}</div>
                  <Progress value={item.value} size="sm" className="mt-2" color={item.value >= 80 ? "success" : item.value >= 60 ? "accent" : "warning"} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={20} className="text-[#FFC72C]" />
              优化建议
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border-l-4 ${
                  suggestion.priority === "high"
                    ? "bg-[#FF2957]/5 border-[#FF2957]"
                    : "bg-[#0055FF]/5 border-[#0055FF]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Badge variant={suggestion.priority === "high" ? "accent" : "default"} className="shrink-0">
                    {suggestion.priority === "high" ? "重要" : "建议"}
                  </Badge>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{suggestion.content}</p>
                </div>
              </div>
            ))}

            {/* Optimized Title */}
            {report.optimized_title && (
              <div className="p-4 bg-[#00D4AA]/10 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#00D4AA]">AI 建议标题</span>
                  <button
                    onClick={() => copyToClipboard(report.optimized_title!, "title")}
                    className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    {copied === "title" ? <Check size={16} className="text-[#00D4AA]" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-neutral-900 dark:text-white font-medium">「{report.optimized_title}」</p>
              </div>
            )}

            {/* Cover Direction */}
            {report.cover_direction && (
              <div className="p-4 bg-[#0055FF]/10 rounded-xl">
                <span className="text-sm font-medium text-[#0055FF]">封面方向建议</span>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-neutral-500">构图：</span>{report.cover_direction.layout}</p>
                  <p><span className="text-neutral-500">配色：</span>{report.cover_direction.color_scheme}</p>
                  <p><span className="text-neutral-500">文字：</span>{report.cover_direction.text_style}</p>
                  {report.cover_direction.tips.map((tip, i) => (
                    <p key={i} className="flex items-center gap-2">
                      <span className="text-[#0055FF]">*</span>
                      {tip}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Debate */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale size={20} className="text-[#8B5CF6]" />
              多Agent诊断详情
            </CardTitle>
            <CardDescription>{report.debate_summary}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.debate_timeline.map((item, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-[#FF2957]/10 flex items-center justify-center text-xs font-medium text-[#FF2957]">
                      {item.step}
                    </div>
                    {idx < report.debate_timeline.length - 1 && (
                      <div className="w-0.5 h-full bg-neutral-200 dark:bg-neutral-700 mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{item.agent}</span>
                      <Badge variant={item.action === "positive" ? "success" : item.action === "negative" ? "accent" : "secondary"} className="text-xs">
                        {item.action === "positive" ? "赞同" : item.action === "negative" ? "反驳" : "补充"}
                      </Badge>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">{item.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Simulated Comments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle size={20} className="text-[#00D4AA]" />
              AI模拟评论区
            </CardTitle>
            <CardDescription>预测真实用户看到笔记后的反应</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.simulated_comments.map((comment, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl flex items-start gap-3"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    comment.type === "positive" ? "bg-[#00D4AA]/20" :
                    comment.type === "question" ? "bg-[#0055FF]/20" : "bg-neutral-200 dark:bg-neutral-700"
                  }`}>
                    <Users size={18} className={
                      comment.type === "positive" ? "text-[#00D4AA]" :
                      comment.type === "question" ? "text-[#0055FF]" : "text-neutral-500"
                    } />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-neutral-800 dark:text-neutral-200 mb-1">{comment.content}</p>
                    <div className="flex items-center gap-2">
                      <Progress value={comment.confidence * 100} size="sm" className="w-24" color="success" />
                      <span className="text-xs text-neutral-400">{Math.round(comment.confidence * 100)}% 置信度</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-xs text-neutral-400 dark:text-neutral-600 py-4">
          本报告由 AI 多 Agent 协作生成，诊断结果仅供参考，不构成任何运营承诺。
        </footer>
      </main>
    </div>
  );
}
