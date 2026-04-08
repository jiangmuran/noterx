import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import { motion, AnimatePresence } from "framer-motion";

interface UploadZoneProps {
  file?: File | null;
  onFileSelect: (file: File | null) => void;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const dashAnimation = `
@keyframes borderDash {
  to { stroke-dashoffset: -20; }
}
`;

export default function UploadZone({ file = null, onFileSelect }: UploadZoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_SIZE = 10 * 1024 * 1024;
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const handleFile = useCallback(
    (file: File) => {
      setError("");
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("\u8BF7\u4E0A\u4F20\u56FE\u7247\u6587\u4EF6\uFF08JPG\u3001PNG\u3001WebP\uFF09");
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(
          `\u6587\u4EF6\u8FC7\u5927\uFF08${formatSize(file.size)}\uFF09\uFF0C\u8BF7\u63A7\u5236\u5728 10 MB \u4EE5\u5185`
        );
        return;
      }
      onFileSelect(file);
      setFileInfo({ name: file.name, size: file.size });
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    },
    [onFileSelect]
  );

  const handleRemove = useCallback(() => {
    setPreview(null);
    setFileInfo(null);
    setError("");
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onFileSelect]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  useEffect(() => {
    if (!file) {
      setPreview(null);
      setFileInfo(null);
      return;
    }

    setFileInfo({ name: file.name, size: file.size });
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, [file]);

  return (
    <>
      <style>{dashAnimation}</style>
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !preview && inputRef.current?.click()}
        sx={{
          position: "relative",
          borderRadius: "16px",
          border: `2px dashed ${
            isDragging ? "#ff2442" : error ? "#ef4444" : "#cbd5e1"
          }`,
          background: isDragging
            ? "rgba(255,36,66,0.03)"
            : "#fff",
          cursor: preview ? "default" : "pointer",
          transition: "all 0.3s ease",
          overflow: "hidden",
          minHeight: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          "&:hover": preview
            ? {}
            : {
                borderColor: "#ff2442",
                background: "#fafafa",
              },
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <AnimatePresence mode="wait">
          {preview && fileInfo ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              style={{
                width: "100%",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Box sx={{ position: "relative", display: "inline-block" }}>
                <Box
                  component="img"
                  src={preview}
                  alt="preview"
                  sx={{
                    maxHeight: 220,
                    maxWidth: "100%",
                    borderRadius: "12px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                    display: "block",
                  }}
                />
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  sx={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    bgcolor: "#ff6b6b",
                    color: "#fff",
                    width: 28,
                    height: 28,
                    "&:hover": { bgcolor: "#e55a5a" },
                    boxShadow: "0 2px 8px rgba(255,107,107,0.4)",
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
              <Typography
                variant="body2"
                sx={{ color: "#0f172a", fontWeight: 500 }}
              >
                {fileInfo.name}
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ color: "#94a3b8", ml: 1 }}
                >
                  {formatSize(fileInfo.size)}
                </Typography>
              </Typography>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: 32,
                gap: 8,
              }}
            >
              <CloudUploadIcon
                sx={{ fontSize: 44, color: "#ccc" }}
              />
              <Typography
                sx={{
                  color: "#666",
                  fontWeight: 500,
                  fontSize: "0.85rem",
                  mt: 1,
                }}
              >
                拖拽截图到这里，点击上传或 Ctrl+V 粘贴
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "#94a3b8", fontSize: "0.8rem" }}
              >
                {"\u652F\u6301 JPG\u3001PNG\u3001WebP\uFF0C\u6700\u5927 10MB"}
              </Typography>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Typography
            variant="body2"
            sx={{ color: "#ef4444", mt: 1, fontSize: "0.85rem" }}
          >
            {error}
          </Typography>
        </motion.div>
      )}
    </>
  );
}
