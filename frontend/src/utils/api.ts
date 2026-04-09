/**
 * API 请求工具
 */
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 120000,
});

function readErrorDetail(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object") return null;

  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();

  const message = (data as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message.trim();

  return null;
}

export function getErrorMessage(error: unknown, fallback = "请求失败，请重试"): string {
  if (axios.isAxiosError(error)) {
    const message = readErrorDetail(error.response?.data);
    if (message) return message;
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

export interface DiagnoseParams {
  title: string;
  content: string;
  category: string;
  tags: string;
  coverImage?: File;
  coverImages?: File[];
  videoFile?: File;
}

export interface AgentOpinion {
  agent_name: string;
  dimension: string;
  score: number;
  issues: string[];
  suggestions: string[];
  reasoning: string;
  debate_comments: string[];
}

export interface SimulatedComment {
  username: string;
  avatar_emoji: string;
  comment: string;
  sentiment: "positive" | "negative" | "neutral";
  likes?: number;
}

export interface DebateEntry {
  round: number;
  agent_name: string;
  kind: "agree" | "rebuttal" | "add";
  text: string;
}

export interface CoverDirection {
  layout: string;
  color_scheme: string;
  text_style: string;
  tips: string[];
}

export interface DiagnoseResult {
  overall_score: number;
  grade: string;
  radar_data: Record<string, number>;
  agent_opinions: AgentOpinion[];
  issues: Array<{ severity: string; description: string; from_agent: string }>;
  suggestions: Array<{
    priority: number;
    description: string;
    expected_impact: string;
  }>;
  debate_summary: string;
  debate_timeline: DebateEntry[];
  simulated_comments: SimulatedComment[];
  optimized_title?: string;
  optimized_content?: string;
  cover_direction?: CoverDirection;
}

export interface BaselineResponse {
  category: string;
  stats: Record<string, unknown>;
  avg_title_length?: number;
  viral_avg_title_length?: number;
  avg_tag_count?: number;
  viral_rate?: number;
}

/**
 * 提交笔记进行诊断
 */
export async function diagnoseNote(
  params: DiagnoseParams
): Promise<DiagnoseResult> {
  const formData = new FormData();
  formData.append("title", params.title);
  formData.append("content", params.content);
  formData.append("category", params.category);
  formData.append("tags", params.tags);
  if (params.coverImage) {
    formData.append("cover_image", params.coverImage);
  }
  if (params.coverImages && params.coverImages.length > 0) {
    params.coverImages.forEach((file) => formData.append("cover_images", file));
  }
  if (params.videoFile) {
    formData.append("video_file", params.videoFile);
  }

  const { data } = await api.post<DiagnoseResult>("/diagnose", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * Model A 即时预评分（<50ms，无 LLM 调用）
 */
export interface PreScoreResult {
  total_score: number;
  dimensions: Record<string, number>;
  weights: Record<string, number>;
  level: string;
  baseline: { avg_engagement: number; median: number; viral_threshold: number; sample_size: number };
  category: string;
  category_cn: string;
}

export async function preScore(params: {
  title: string; content: string; category: string; tags: string; image_count: number;
}): Promise<PreScoreResult> {
  const fd = new FormData();
  fd.append("title", params.title);
  fd.append("content", params.content);
  fd.append("category", params.category);
  fd.append("tags", params.tags);
  fd.append("image_count", String(params.image_count));
  const { data } = await api.post<PreScoreResult>("/pre-score", fd);
  return data;
}

/**
 * SSE 流式诊断
 */
export type StreamEvent =
  | { type: "pre_score"; data: PreScoreResult & { title: string } }
  | { type: "progress"; data: { step: string; message: string } }
  | { type: "result"; data: DiagnoseResult }
  | { type: "error"; data: { message: string } };

export async function diagnoseStream(
  params: DiagnoseParams,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const fd = new FormData();
  fd.append("title", params.title);
  fd.append("content", params.content);
  fd.append("category", params.category);
  fd.append("tags", params.tags);
  if (params.coverImage) fd.append("cover_image", params.coverImage);
  if (params.coverImages) params.coverImages.forEach((f) => fd.append("cover_images", f));
  if (params.videoFile) fd.append("video_file", params.videoFile);

  const response = await fetch("/api/diagnose-stream", { method: "POST", body: fd });
  if (!response.ok) {
    const raw = await response.text();
    let message = `HTTP ${response.status}`;
    try {
      message = readErrorDetail(JSON.parse(raw)) ?? message;
    } catch {
      message = raw.trim() || message;
    }
    throw new Error(message);
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ") && eventType) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent({ type: eventType, data } as StreamEvent);
        } catch { /* ignore parse errors */ }
        eventType = "";
      }
    }
  }
}

/**
 * 获取垂类 baseline 概览
 */
export async function getBaseline(category: string): Promise<BaselineResponse> {
  const { data } = await api.get<BaselineResponse>(`/baseline/${category}`);
  return data;
}

/**
 * 生成更多模拟评论
 */
export interface CommentWithReplies extends SimulatedComment {
  replies?: SimulatedComment[];
}

export async function generateComments(params: {
  title: string;
  content: string;
  category: string;
  existing_count: number;
}): Promise<CommentWithReplies[]> {
  const { data } = await api.post<{ comments: CommentWithReplies[] }>(
    "/generate-comments",
    params
  );
  return data.comments;
}

// --------------- 历史记录 ---------------

export interface HistoryListItem {
  id: string;
  title: string;
  category: string;
  overall_score: number;
  grade: string;
  created_at: string;
}

export interface HistoryDetail extends HistoryListItem {
  report: DiagnoseResult;
}

/**
 * @param params - title, category, report(完整 DiagnoseResult)
 * @returns {id: string}
 */
export async function saveHistory(params: {
  title: string;
  category: string;
  report: DiagnoseResult;
}): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>("/history", params);
  return data;
}

/**
 * @param limit - 每页条数
 * @param offset - 偏移量
 */
export async function getHistoryList(
  limit = 20,
  offset = 0
): Promise<HistoryListItem[]> {
  const { data } = await api.get<HistoryListItem[]>("/history", {
    params: { limit, offset },
  });
  return data;
}

/**
 * @param id - 记录 UUID
 */
export async function getHistoryDetail(id: string): Promise<HistoryDetail> {
  const { data } = await api.get<HistoryDetail>(`/history/${id}`);
  return data;
}

/**
 * @param id - 记录 UUID
 */
export async function deleteHistory(id: string): Promise<void> {
  await api.delete(`/history/${id}`);
}

// --------------- 截图分析 ---------------

export type SlotType = "cover" | "content" | "profile" | "comments";

export interface QuickRecognizeResult {
  success: boolean;
  slot_type: string;
  category: string;
  title?: string;
  content_text?: string;
  summary: string;
  confidence?: number;
  error?: string;
}

export interface DeepAnalysisResult {
  scenario: string;
  slot_count: number;
  extra_text: string;
  video_info: { filename: string; size_mb: number; content_type: string } | null;
  analyses: Record<string, Record<string, unknown>>;
  overall: {
    completeness: number;
    scenario: string;
    tips: string[];
    slots_analyzed: string[];
  };
}

/**
 * 上传单张截图进行 AI 快速识别
 * @param file - 图片文件
 * @param slotHint - 位置提示
 */
export async function quickRecognize(
  file: File,
  slotHint?: SlotType
): Promise<QuickRecognizeResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (slotHint) fd.append("slot_hint", slotHint);
  const { data } = await api.post<QuickRecognizeResult>(
    "/screenshot/quick-recognize",
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

/**
 * 提交完整图包进行深度分析
 * @param params - 包含 scenario 和各维度截图
 */
export async function deepAnalyze(params: {
  scenario: "pre_publish" | "post_publish";
  cover?: File;
  contentImg?: File;
  profile?: File;
  comments?: File;
  video?: File;
  extraText?: string;
}): Promise<DeepAnalysisResult> {
  const fd = new FormData();
  fd.append("scenario", params.scenario);
  if (params.cover) fd.append("cover", params.cover);
  if (params.contentImg) fd.append("content_img", params.contentImg);
  if (params.profile) fd.append("profile", params.profile);
  if (params.comments) fd.append("comments", params.comments);
  if (params.video) fd.append("video", params.video);
  if (params.extraText) fd.append("extra_text", params.extraText);
  const { data } = await api.post<DeepAnalysisResult>(
    "/screenshot/deep-analyze",
    fd,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 180000 }
  );
  return data;
}

/**
 * 过滤文本中的链接
 */
export async function stripLinks(text: string): Promise<string> {
  const fd = new FormData();
  fd.append("text", text);
  const { data } = await api.post<{ cleaned: string }>("/text/strip-links", fd);
  return data.cleaned;
}

export default api;
