import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, TextField, Button, Card, CardContent, Tabs, Tab,
  Stack, Alert, CircularProgress, Chip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import LinkIcon from "@mui/icons-material/Link";
import UploadZone from "../components/UploadZone";
import CategorySelector from "../components/CategorySelector";
import { parseLink } from "../utils/api";

/**
 * 首页 - 笔记上传入口
 */
export default function Home() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("food");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");

  const canSubmit = tabIndex === 1 ? coverFile !== null : title.trim().length > 0;

  const handleSubmit = () => {
    navigate("/diagnosing", { state: { title, content, tags, category, coverFile } });
  };

  const handleParseLink = async () => {
    if (!linkUrl.trim()) return;
    setLinkLoading(true);
    setLinkError("");
    try {
      const result = await parseLink(linkUrl);
      if (result.success) {
        setTitle(result.title);
        setContent(result.content);
        setTags(result.tags.join(","));
        setTabIndex(0);
      } else {
        setLinkError(result.error || "解析失败，请手动输入");
      }
    } catch {
      setLinkError("网络错误，请稍后重试或手动输入");
    } finally {
      setLinkLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #ecfdf5 0%, #ffffff 50%, #f0fdfa 100%)",
      }}
    >
      {/* Header */}
      <Box sx={{ pt: 6, pb: 2, textAlign: "center" }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Typography fontSize={40}>💊</Typography>
          <Typography
            variant="h3"
            fontWeight={800}
            sx={{
              background: "linear-gradient(135deg, #059669, #0d9488)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            薯医 NoteRx
          </Typography>
        </Box>
        <Typography variant="subtitle1" color="text.secondary">
          你的笔记，值得被看见。
        </Typography>
      </Box>

      {/* 主表单 */}
      <Box sx={{ maxWidth: 640, mx: "auto", px: 2, pb: 6 }}>
        <Card>
          <Tabs
            value={tabIndex}
            onChange={(_, v) => setTabIndex(v)}
            variant="fullWidth"
            sx={{
              borderBottom: "1px solid",
              borderColor: "divider",
              "& .MuiTab-root": { fontWeight: 600, py: 1.5 },
            }}
          >
            <Tab label="📝 粘贴文字" />
            <Tab label="📸 上传截图" />
            <Tab label="🔗 粘贴链接" />
          </Tabs>

          <CardContent sx={{ p: 3 }}>
            <Stack spacing={3}>
              <CategorySelector value={category} onChange={setCategory} />

              {/* Tab 0: 文字 */}
              {tabIndex === 0 && (
                <>
                  <TextField
                    label="笔记标题"
                    required
                    fullWidth
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入你的笔记标题"
                    slotProps={{ htmlInput: { maxLength: 100 } }}
                    helperText={`${title.length}/100`}
                  />
                  <TextField
                    label="笔记正文"
                    fullWidth
                    multiline
                    rows={5}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="粘贴你的笔记正文（可选）"
                  />
                  <TextField
                    label="标签"
                    fullWidth
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="用逗号分隔，如：美食分享,减脂餐,食谱"
                  />
                </>
              )}

              {/* Tab 1: 截图 */}
              {tabIndex === 1 && (
                <>
                  <UploadZone onFileSelect={setCoverFile} />
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", display: "block" }}>
                    上传截图后可自动识别标题和正文（需后端 API 支持）
                  </Typography>
                  <TextField
                    label="笔记标题（可选，留空则由 AI 自动识别）"
                    fullWidth
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="留空将自动从截图中识别"
                  />
                </>
              )}

              {/* Tab 2: 链接 */}
              {tabIndex === 2 && (
                <>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <TextField
                      fullWidth
                      label="小红书笔记链接"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="粘贴小红书分享链接"
                      slotProps={{ input: { startAdornment: <LinkIcon sx={{ mr: 1, color: "text.disabled" }} /> } }}
                    />
                    <Button
                      variant="contained"
                      disabled={linkLoading || !linkUrl.trim()}
                      onClick={handleParseLink}
                      sx={{ minWidth: 80, flexShrink: 0 }}
                    >
                      {linkLoading ? <CircularProgress size={22} color="inherit" /> : "解析"}
                    </Button>
                  </Box>
                  {linkError && <Alert severity="error">{linkError}</Alert>}
                  <Typography variant="caption" color="text.secondary">
                    支持小红书笔记分享链接，解析后自动填充标题和内容
                  </Typography>
                  {title && (
                    <Alert severity="success" icon={false}>
                      <Typography variant="subtitle2">已解析内容：</Typography>
                      <Typography variant="body2">标题：{title}</Typography>
                      {tags && <Typography variant="caption">标签：{tags}</Typography>}
                    </Alert>
                  )}
                </>
              )}

              {/* 提交按钮 */}
              <Button
                variant="contained"
                size="large"
                fullWidth
                disabled={!canSubmit}
                onClick={handleSubmit}
                startIcon={<SearchIcon />}
                sx={{ py: 1.5, fontSize: "1.05rem" }}
              >
                开始诊断
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* 特色亮点 */}
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 4, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { icon: "🤖", label: "多Agent智能诊断" },
            { icon: "📊", label: "真实数据量化对比" },
            { icon: "💬", label: "AI模拟评论区" },
            { icon: "⚔️", label: "Agent辩论机制" },
            { icon: "✨", label: "一键优化建议" },
          ].map((f) => (
            <Chip
              key={f.label}
              label={`${f.icon} ${f.label}`}
              variant="outlined"
              sx={{ bgcolor: "rgba(255,255,255,0.8)", backdropFilter: "blur(4px)" }}
            />
          ))}
        </Stack>

        <Typography component="p" variant="caption" color="text.disabled" sx={{ display: "block", textAlign: "center", mt: 4 }}>
          薯医 NoteRx · AI 诊断仅供参考
        </Typography>
      </Box>
    </Box>
  );
}
