/**
 * API 请求工具
 */
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 120000,
});

export interface DiagnoseParams {
  title: string;
  content: string;
  category: string;
  tags: string;
  coverImage?: File;
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

export interface ParseLinkResult {
  success: boolean;
  error?: string;
  title: string;
  content: string;
  tags: string[];
  cover_url: string;
  note_id?: string;
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

  const { data } = await api.post<DiagnoseResult>("/diagnose", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * 解析小红书链接
 */
export async function parseLink(url: string): Promise<ParseLinkResult> {
  const { data } = await api.post<ParseLinkResult>("/parse-link", { url });
  return data;
}

/**
 * 获取垂类 baseline 概览
 */
export async function getBaseline(category: string) {
  const { data } = await api.get(`/baseline/${category}`);
  return data;
}

export default api;
