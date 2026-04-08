import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import {
  Stethoscope, FileText, ImageIcon, Link2, Search,
  Sparkles, BarChart3, MessageCircle, Zap, ArrowRight,
  Upload, Check, X, ChefHat, Shirt, Smartphone, Plane, Sparkle, Dumbbell
} from "../components/Icons";

const CATEGORIES = [
  { id: "food", label: "美食", icon: ChefHat },
  { id: "fashion", label: "穿搭", icon: Shirt },
  { id: "tech", label: "科技", icon: Smartphone },
  { id: "travel", label: "旅行", icon: Plane },
  { id: "beauty", label: "美妆", icon: Sparkle },
  { id: "fitness", label: "健身", icon: Dumbbell },
];

const FEATURES = [
  { icon: Sparkles, label: "多Agent智能诊断", color: "text-[#FF2957]" },
  { icon: BarChart3, label: "真实数据量化对比", color: "text-[#0055FF]" },
  { icon: MessageCircle, label: "AI模拟评论区", color: "text-[#00D4AA]" },
  { icon: Zap, label: "一键优化建议", color: "text-[#FFC72C]" },
];

export default function Home() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("food");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<"text" | "image" | "link">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (file.type.startsWith("image/")) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleSubmit = () => {
    navigate("/diagnosing", {
      state: { title, content, tags, category, coverFile },
    });
  };

  const canSubmit = title.trim().length > 0 || coverFile !== null;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#FF2957] flex items-center justify-center">
              <Stethoscope className="text-white" size={20} />
            </div>
            <span className="font-semibold text-xl tracking-tight">薯医 NoteRx</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-[#FF2957]/5 rounded-3xl rotate-12" />
          <div className="absolute top-40 right-20 w-24 h-24 bg-[#0055FF]/5 rounded-2xl -rotate-12" />
          <div className="absolute bottom-40 left-1/4 w-40 h-40 bg-[#FFC72C]/5 rounded-3xl rotate-45" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          <div className="text-center mb-12">
            <Badge variant="accent" className="mb-6">AI 驱动的小红书笔记诊断</Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              诊断你的笔记
              <br />
              <span className="text-neutral-400 dark:text-neutral-500">让数据告诉你为什么没火</span>
            </h1>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
              多Agent智能诊断 + 真实数据对比 + AI模拟评论区
            </p>
          </div>

          {/* Main Input Card */}
          <Card variant="elevated" className="max-w-2xl mx-auto">
            <CardContent className="p-6 sm:p-8">
              {/* Category Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">选择内容分类</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                          category === cat.id
                            ? "bg-[#FF2957] text-white shadow-md"
                            : "bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                        }`}
                      >
                        <Icon size={16} />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Input Tabs */}
              <div className="flex gap-2 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl mb-6">
                {[
                  { id: "text", label: "粘贴文字", icon: FileText },
                  { id: "image", label: "上传截图", icon: ImageIcon },
                  { id: "link", label: "粘贴链接", icon: Link2 },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                        activeTab === tab.id
                          ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                          : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="space-y-4">
                {activeTab === "text" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">笔记标题</label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="输入你的笔记标题"
                        maxLength={100}
                      />
                      <div className="mt-1 text-xs text-neutral-400 text-right">{title.length}/100</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">笔记正文</label>
                      <Textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="粘贴你的笔记正文（可选）"
                        rows={5}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">标签</label>
                      <Input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="用逗号分隔，如：美食分享,减脂餐,食谱"
                      />
                    </div>
                  </>
                )}

                {activeTab === "image" && (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
                      transition-all duration-200
                      ${isDragging
                        ? "border-[#FF2957] bg-[#FF2957]/5"
                        : "border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500"
                      }
                    `}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    {coverPreview ? (
                      <div className="relative">
                        <img src={coverPreview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setCoverFile(null); setCoverPreview(null); }}
                          className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center">
                          <Upload size={28} className="text-neutral-400" />
                        </div>
                        <p className="text-neutral-900 dark:text-white font-medium mb-1">点击或拖拽上传截图</p>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">支持 JPG、PNG 格式</p>
                      </>
                    )}
                  </div>
                )}

                {activeTab === "link" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">小红书笔记链接</label>
                      <div className="flex gap-2">
                        <Input
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="粘贴小红书分享链接"
                          className="flex-1"
                        />
                        <Button variant="secondary" size="sm">解析</Button>
                      </div>
                    </div>
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl">
                      <div className="flex items-center gap-2 text-[#00D4AA] mb-2">
                        <Check size={16} />
                        <span className="text-sm font-medium">已解析内容</span>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">标题：{title || "等待解析..."}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <Button
                size="lg"
                className="w-full mt-6"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                <Search size={20} className="mr-2" />
                开始诊断
                <ArrowRight size={18} className="ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Features */}
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.label}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-800 rounded-full border border-neutral-200 dark:border-neutral-700 shadow-sm"
                >
                  <Icon size={16} className={f.color} />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-600">
        薯医 NoteRx · AI 诊断仅供参考
      </footer>
    </div>
  );
}
