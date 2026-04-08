import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { motion, AnimatePresence } from "framer-motion";

interface UploadZoneProps {
  /** Controlled file list from parent */
  files?: File[];
  /** Called whenever the file list changes */
  onFilesChange: (files: File[]) => void;
  /** Max number of files allowed */
  maxFiles?: number;
  /** Desktop compact mode: denser grid and smaller empty state */
  compact?: boolean;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ALL_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

/**
 * Multi-file upload zone with grid preview.
 * Supports images and one video. Shows thumbnails in a responsive grid.
 */
export default function UploadZone({
  files = [],
  onFilesChange,
  maxFiles = 9,
  compact = false,
}: UploadZoneProps) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /** Generate preview URLs for new files */
  useEffect(() => {
    const newPreviews: Record<string, string> = {};
    const toRevoke: string[] = [];

    files.forEach((f) => {
      const key = `${f.name}_${f.size}_${f.lastModified}`;
      if (previews[key]) {
        newPreviews[key] = previews[key];
      } else if (IMAGE_TYPES.includes(f.type)) {
        const url = URL.createObjectURL(f);
        newPreviews[key] = url;
      }
    });

    Object.entries(previews).forEach(([k, url]) => {
      if (!newPreviews[k]) toRevoke.push(url);
    });
    toRevoke.forEach((u) => URL.revokeObjectURL(u));

    setPreviews(newPreviews);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const fileKey = (f: File) => `${f.name}_${f.size}_${f.lastModified}`;

  const validateAndAdd = useCallback(
    (incoming: File[]) => {
      setError("");
      const valid: File[] = [];
      for (const f of incoming) {
        const isVideo = VIDEO_TYPES.includes(f.type);
        const isImage = IMAGE_TYPES.includes(f.type);
        if (!isImage && !isVideo) {
          setError("仅支持图片（JPG/PNG/WebP）或视频（MP4/MOV/WebM）");
          continue;
        }
        if (isImage && f.size > MAX_IMAGE) {
          setError(`图片过大（${formatSize(f.size)}），最大 10MB`);
          continue;
        }
        if (isVideo && f.size > MAX_VIDEO) {
          setError(`视频过大（${formatSize(f.size)}），最大 200MB`);
          continue;
        }
        if (isVideo && files.some((ex) => VIDEO_TYPES.includes(ex.type))) {
          setError("仅支持上传一个视频");
          continue;
        }
        valid.push(f);
      }
      if (valid.length === 0) return;
      const merged = [...files, ...valid].slice(0, maxFiles);
      onFilesChange(merged);
    },
    [files, maxFiles, onFilesChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      validateAndAdd(Array.from(e.dataTransfer.files));
    },
    [validateAndAdd],
  );

  const removeFile = useCallback(
    (idx: number) => {
      const next = files.filter((_, i) => i !== idx);
      onFilesChange(next);
    },
    [files, onFilesChange],
  );

  const hasFiles = files.length > 0;

  return (
    <>
      <Box
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        sx={{
          borderRadius: "14px",
          border: `2px dashed ${isDragging ? "rgba(255, 36, 66, 0.65)" : error ? "#ef4444" : "rgba(0,0,0,0.1)"}`,
          bgcolor: isDragging ? "rgba(255,36,66,0.06)" : "rgba(255,255,255,0.65)",
          backdropFilter: "blur(6px)",
          boxShadow: isDragging
            ? "0 0 0 3px rgba(255,36,66,0.12), inset 0 1px 0 rgba(255,255,255,0.9)"
            : "inset 0 1px 0 rgba(255,255,255,0.85)",
          transition: "border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALL_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) validateAndAdd(Array.from(e.target.files));
            e.target.value = "";
          }}
        />

        <AnimatePresence mode="wait">
          {hasFiles ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: compact ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
                  gap: compact ? 0.75 : 1,
                  p: compact ? 1 : 1.5,
                  maxHeight: compact ? 220 : "none",
                  overflowY: compact ? "auto" : "visible",
                }}
              >
                {files.map((f, idx) => {
                  const key = fileKey(f);
                  const isVideo = VIDEO_TYPES.includes(f.type);
                  return (
                    <Box
                      key={key}
                      sx={{
                        position: "relative",
                        aspectRatio: "1",
                        borderRadius: "12px",
                        overflow: "hidden",
                        bgcolor: "#f0f0f2",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        "&:hover": { transform: "scale(1.02)", boxShadow: "0 4px 14px rgba(0,0,0,0.1)" },
                      }}
                    >
                      {isVideo ? (
                        <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <VideocamOutlinedIcon sx={{ fontSize: 28, color: "#999" }} />
                        </Box>
                      ) : previews[key] ? (
                        <Box
                          component="img"
                          src={previews[key]}
                          alt={f.name}
                          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Typography sx={{ fontSize: 11, color: "#999" }}>加载中</Typography>
                        </Box>
                      )}
                      <IconButton
                        size="small"
                        aria-label="删除文件"
                        onClick={() => removeFile(idx)}
                        sx={{
                          position: "absolute", top: 2, right: 2,
                          bgcolor: "rgba(0,0,0,0.5)", color: "#fff",
                          width: 24, height: 24, minWidth: 24,
                          padding: 0,
                          "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  );
                })}
                {files.length < maxFiles && (
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label="添加更多文件"
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
                    sx={{
                      aspectRatio: "1",
                      borderRadius: "12px",
                      border: "1px dashed rgba(255,36,66,0.25)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      bgcolor: "rgba(255,245,247,0.4)",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        borderColor: "primary.main",
                        bgcolor: "rgba(255,36,66,0.08)",
                        boxShadow: "0 2px 12px rgba(255,36,66,0.12)",
                      },
                      "&:focus-visible": { outline: "2px solid #ff2442", outlineOffset: 2 },
                    }}
                  >
                    <AddPhotoAlternateIcon sx={{ fontSize: 24, color: "#ccc" }} />
                    <Typography sx={{ fontSize: 11, color: "#999", mt: 0.25 }}>
                      {files.length}/{maxFiles}
                    </Typography>
                  </Box>
                )}
              </Box>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: compact ? 16 : 28,
                gap: compact ? 4 : 6,
                cursor: "pointer",
              }}
              onClick={() => inputRef.current?.click()}
            >
              <CloudUploadIcon
                sx={{
                  fontSize: compact ? 32 : 38,
                  color: "primary.light",
                  filter: "drop-shadow(0 2px 6px rgba(255,36,66,0.2))",
                }}
              />
              <Typography sx={{ color: "text.primary", fontWeight: 600, fontSize: compact ? "0.8rem" : "0.85rem", mt: 0.5, textAlign: "center", letterSpacing: "0.01em" }}>
                拖拽、点击或 Ctrl+V 上传（支持多选）
              </Typography>
              <Typography sx={{ color: "text.secondary", opacity: 0.85, fontSize: compact ? "0.7rem" : "0.75rem", textAlign: "center", lineHeight: 1.55 }}>
                图片（JPG/PNG/WebP，最多 {maxFiles} 张）或视频（MP4/MOV，1 个）
              </Typography>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      {error && (
        <Typography role="alert" sx={{ color: "#ef4444", mt: 0.75, fontSize: "0.8rem" }}>
          {error}
        </Typography>
      )}
    </>
  );
}
