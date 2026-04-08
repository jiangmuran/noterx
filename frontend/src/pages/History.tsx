import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { motion } from "framer-motion";
import {
  getHistoryList,
  getHistoryDetail,
  deleteHistory,
} from "../utils/api";
import type { HistoryListItem } from "../utils/api";

const CATEGORY_LABEL: Record<string, string> = {
  food: "美食",
  fashion: "时尚",
  tech: "科技",
  travel: "旅行",
  beauty: "美妆",
  fitness: "健身",
  life: "生活",
};

const GRADE_COLOR: Record<string, string> = {
  S: "#ea580c",
  A: "#16a34a",
  B: "#2563eb",
  C: "#d97706",
  D: "#dc2626",
};

/**
 * 历史记录页
 */
export default function History() {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryListItem | null>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const list = await getHistoryList(50);
      setItems(list);
    } catch (e) {
      console.error("获取历史记录失败", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  /** 点击卡片：加载完整报告后跳转 Report 页 */
  const handleOpen = async (item: HistoryListItem) => {
    setNavigating(item.id);
    try {
      const detail = await getHistoryDetail(item.id);
      navigate("/report", {
        state: {
          report: detail.report,
          params: { title: detail.title, category: detail.category },
          isFallback: false,
        },
      });
    } catch (e) {
      console.error("获取报告详情失败", e);
      setNavigating(null);
    }
  };

  /** 确认删除 */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteHistory(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } catch (e) {
      console.error("删除失败", e);
    }
    setDeleteTarget(null);
  };

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa" }}>
      {/* 顶栏 */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "#fff",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Box
          sx={{
            maxWidth: 640,
            mx: "auto",
            px: 2,
            py: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/")}
            size="small"
            sx={{ color: "#262626" }}
          >
            首页
          </Button>
          <Typography sx={{ fontWeight: 700, color: "#262626", fontSize: 16 }}>
            诊断历史
          </Typography>
          <Box sx={{ width: 64 }} />
        </Box>
      </Box>

      <Box sx={{ maxWidth: 640, mx: "auto", px: 2, mt: 3, pb: 10 }}>
        {loading ? (
          <Box sx={{ textAlign: "center", py: 10 }}>
            <CircularProgress size={28} sx={{ color: "#999" }} />
            <Typography sx={{ mt: 2, color: "#999", fontSize: 14 }}>
              加载中...
            </Typography>
          </Box>
        ) : items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Box sx={{ textAlign: "center", py: 10 }}>
              <InboxOutlinedIcon sx={{ fontSize: 56, color: "#ccc" }} />
              <Typography sx={{ mt: 1.5, color: "#999", fontSize: 14 }}>
                暂无诊断记录
              </Typography>
              <Button
                variant="contained"
                disableElevation
                sx={{
                  mt: 3,
                  bgcolor: "#262626",
                  borderRadius: "8px",
                  textTransform: "none",
                  "&:hover": { bgcolor: "#404040" },
                }}
                onClick={() => navigate("/")}
              >
                去诊断
              </Button>
            </Box>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {items.map((item) => {
                const gradeColor = GRADE_COLOR[item.grade] || "#999";
                return (
                  <Box
                    key={item.id}
                    onClick={() => !navigating && handleOpen(item)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 2,
                      py: 1.5,
                      bgcolor: "#fff",
                      border: "1px solid #f0f0f0",
                      borderRadius: "12px",
                      cursor: navigating === item.id ? "wait" : "pointer",
                      transition: "border-color 0.15s",
                      "&:hover": { borderColor: "#e0e0e0" },
                    }}
                  >
                    {/* 分数 */}
                    <Typography
                      sx={{
                        fontWeight: 800,
                        fontSize: 22,
                        lineHeight: 1,
                        color: gradeColor,
                        minWidth: 36,
                        textAlign: "center",
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(item.overall_score)}
                    </Typography>

                    {/* 标题 + 标签 + 日期 */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontWeight: 600,
                          fontSize: 14,
                          color: "#262626",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.title}
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mt: 0.5,
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 11,
                            color: "#999",
                            border: "1px solid #f0f0f0",
                            borderRadius: "4px",
                            px: 0.75,
                            py: 0.1,
                            lineHeight: "18px",
                          }}
                        >
                          {CATEGORY_LABEL[item.category] || item.category}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: "#999" }}>
                          {formatTime(item.created_at)}
                        </Typography>
                      </Box>
                    </Box>

                    {navigating === item.id && (
                      <CircularProgress size={16} sx={{ color: "#999" }} />
                    )}

                    <Button
                      size="small"
                      variant="text"
                      startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                      sx={{
                        color: "#666",
                        minWidth: "unset",
                        px: 0.5,
                        textTransform: "none",
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!navigating) {
                          handleOpen(item);
                        }
                      }}
                    >
                      查看结果
                    </Button>

                    {/* 删除按钮 */}
                    <IconButton
                      size="small"
                      sx={{
                        color: "#ccc",
                        flexShrink: 0,
                        "&:hover": { color: "#dc2626" },
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(item);
                      }}
                    >
                      <DeleteOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          </motion.div>
        )}
      </Box>

      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        PaperProps={{
          sx: {
            borderRadius: "12px",
            maxWidth: 360,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16, color: "#262626" }}>
          删除记录
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14, color: "#999" }}>
            确定删除「{deleteTarget?.title}」的诊断记录吗？此操作不可恢复。
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            sx={{ color: "#999", textTransform: "none" }}
          >
            取消
          </Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            disableElevation
            sx={{
              bgcolor: "#dc2626",
              textTransform: "none",
              borderRadius: "8px",
              "&:hover": { bgcolor: "#b91c1c" },
            }}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
