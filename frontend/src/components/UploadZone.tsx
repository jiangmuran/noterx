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
          borderRadius: "12px",
          border: `2px dashed ${isDragging ? "#ff2442" : error ? "#ef4444" : "#e0e0e0"}`,
          bgcolor: isDragging ? "rgba(255,36,66,0.03)" : "#fff",
          transition: "all 0.2s",
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
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 1,
                  p: 1.5,
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
                        borderRadius: "8px",
                        overflow: "hidden",
                        bgcolor: "#f5f5f5",
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
                        onClick={() => removeFile(idx)}
                        sx={{
                          position: "absolute", top: 2, right: 2,
                          bgcolor: "rgba(0,0,0,0.45)", color: "#fff",
                          width: 20, height: 20,
                          "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Box>
                  );
                })}
                {files.length < maxFiles && (
                  <Box
                    onClick={() => inputRef.current?.click()}
                    sx={{
                      aspectRatio: "1",
                      borderRadius: "8px",
                      border: "1px dashed #ddd",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      "&:hover": { borderColor: "#ff2442", bgcolor: "#fff5f6" },
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
              style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 28, gap: 6, cursor: "pointer" }}
              onClick={() => inputRef.current?.click()}
            >
              <CloudUploadIcon sx={{ fontSize: 36, color: "#ccc" }} />
              <Typography sx={{ color: "#666", fontWeight: 500, fontSize: "0.85rem", mt: 0.5 }}>
                拖拽、点击或 Ctrl+V 上传（支持多选）
              </Typography>
              <Typography sx={{ color: "#bbb", fontSize: "0.75rem" }}>
                图片（JPG/PNG/WebP，最多 {maxFiles} 张）或视频（MP4/MOV，1 个）
              </Typography>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      {error && (
        <Typography sx={{ color: "#ef4444", mt: 0.75, fontSize: "0.8rem" }}>
          {error}
        </Typography>
      )}
    </>
  );
}
