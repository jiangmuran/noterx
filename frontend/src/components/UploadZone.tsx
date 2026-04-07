import { useState, useCallback, useRef } from "react";
import { Box, Typography, Paper } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

interface Props {
  onFileSelect: (file: File) => void;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 拖拽/点击上传区域
 */
export default function UploadZone({ onFileSelect }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_SIZE = 10 * 1024 * 1024;

  const handleFile = useCallback(
    (file: File) => {
      setError("");
      if (!file.type.startsWith("image/")) {
        setError("请上传图片文件（JPG、PNG、WebP）");
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(`文件过大（${formatSize(file.size)}），请控制在 10 MB 以内`);
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <Box>
      <Paper
        variant="outlined"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          p: 4,
          textAlign: "center",
          cursor: "pointer",
          borderStyle: "dashed",
          borderWidth: 2,
          borderColor: isDragging ? "primary.main" : error ? "error.main" : "divider",
          bgcolor: isDragging ? "primary.light" : "transparent",
          opacity: isDragging ? 0.8 : 1,
          transition: "all 0.2s",
          "&:hover": {
            borderColor: "primary.light",
            bgcolor: "action.hover",
          },
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {preview ? (
          <Box>
            <Box
              component="img"
              src={preview}
              alt="preview"
              sx={{ maxHeight: 200, borderRadius: 2, mx: "auto", display: "block", mb: 1 }}
            />
            {fileInfo && (
              <Typography variant="caption" color="text.secondary">
                {fileInfo.name} · {formatSize(fileInfo.size)}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              点击或拖拽替换图片
            </Typography>
          </Box>
        ) : (
          <Box>
            <CloudUploadIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary">拖拽图片到此处，或点击上传</Typography>
            <Typography variant="caption" color="text.disabled">
              支持 JPG、PNG、WebP · 最大 10MB
            </Typography>
          </Box>
        )}
      </Paper>
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
