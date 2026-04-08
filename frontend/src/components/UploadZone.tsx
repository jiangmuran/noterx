import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import { motion, AnimatePresence } from "framer-motion";

/** @typedef {"image"|"video"} MediaType */
type MediaType = "image" | "video";

interface UploadZoneProps {
  file?: File | null;
  onFileSelect: (file: File | null, mediaType: MediaType | null) => void;
  /** Accepted media types — defaults to both image and video */
  accept?: MediaType[];
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {string} mime - MIME type of the file
 * @returns {MediaType|null}
 */
function detectMediaType(mime: string): MediaType | null {
  if (IMAGE_TYPES.includes(mime)) return "image";
  if (VIDEO_TYPES.includes(mime)) return "video";
  return null;
}

const dashAnimation = `
@keyframes borderDash {
  to { stroke-dashoffset: -20; }
}
`;

/**
 * Unified media upload zone supporting both images and videos.
 * Shows image preview via `<img>`, video preview via `<video>`.
 */
export default function UploadZone({
  file = null,
  onFileSelect,
  accept = ["image", "video"],
}: UploadZoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptedMimes = [
    ...(accept.includes("image") ? IMAGE_TYPES : []),
    ...(accept.includes("video") ? VIDEO_TYPES : []),
  ];

  const handleFile = useCallback(
    (f: File) => {
      setError("");
      const type = detectMediaType(f.type);
      if (!type || !acceptedMimes.includes(f.type)) {
        const labels = accept.map((t) => (t === "image" ? "图片" : "视频")).join("或");
        setError(`请上传${labels}文件`);
        return;
      }
      const limit = type === "video" ? VIDEO_MAX : IMAGE_MAX;
      if (f.size > limit) {
        setError(`文件过大（${formatSize(f.size)}），${type === "video" ? "视频" : "图片"}最大 ${formatSize(limit)}`);
        return;
      }
      onFileSelect(f, type);
      setFileInfo({ name: f.name, size: f.size });
      setMediaType(type);

      if (type === "image") {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(f);
      } else {
        setPreview(URL.createObjectURL(f));
      }
    },
    [onFileSelect, accept, acceptedMimes],
  );

  const handleRemove = useCallback(() => {
    if (preview && mediaType === "video") URL.revokeObjectURL(preview);
    setPreview(null);
    setFileInfo(null);
    setMediaType(null);
    setError("");
    onFileSelect(null, null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onFileSelect, preview, mediaType]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  useEffect(() => {
    if (!file) {
      setPreview(null);
      setFileInfo(null);
      setMediaType(null);
      return;
    }
    const type = detectMediaType(file.type);
    setMediaType(type);
    setFileInfo({ name: file.name, size: file.size });

    if (type === "image") {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else if (type === "video") {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const acceptAttr = acceptedMimes.join(",");
  const supportsVideo = accept.includes("video");
  const supportsImage = accept.includes("image");

  const hintText = supportsImage && supportsVideo
    ? "拖拽照片或视频到这里，或点击上传"
    : supportsVideo
      ? "拖拽视频到这里，或点击上传"
      : "拖拽截图到这里，点击上传或 Ctrl+V 粘贴";

  const formatHint = [
    ...(supportsImage ? ["JPG、PNG、WebP"] : []),
    ...(supportsVideo ? ["MP4、MOV、WebM"] : []),
  ].join("，");

  const sizeHint = supportsVideo ? "图片最大 10MB，视频最大 100MB" : "最大 10MB";

  return (
    <>
      <style>{dashAnimation}</style>
      <Box
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !preview && inputRef.current?.click()}
        sx={{
          position: "relative",
          borderRadius: "16px",
          border: `2px dashed ${isDragging ? "#ff2442" : error ? "#ef4444" : "#cbd5e1"}`,
          background: isDragging ? "rgba(255,36,66,0.03)" : "#fff",
          cursor: preview ? "default" : "pointer",
          transition: "all 0.3s ease",
          overflow: "hidden",
          minHeight: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          "&:hover": preview ? {} : { borderColor: "#ff2442", background: "#fafafa" },
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
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
              style={{ width: "100%", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
            >
              <Box sx={{ position: "relative", display: "inline-block" }}>
                {mediaType === "video" ? (
                  <Box
                    component="video"
                    src={preview}
                    autoPlay
                    muted
                    loop
                    playsInline
                    sx={{
                      maxHeight: 220, maxWidth: "100%", borderRadius: "12px",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)", display: "block",
                    }}
                  />
                ) : (
                  <Box
                    component="img"
                    src={preview}
                    alt="preview"
                    sx={{
                      maxHeight: 220, maxWidth: "100%", borderRadius: "12px",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)", display: "block",
                    }}
                  />
                )}
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                  sx={{
                    position: "absolute", top: -10, right: -10,
                    bgcolor: "#ff6b6b", color: "#fff", width: 28, height: 28,
                    "&:hover": { bgcolor: "#e55a5a" },
                    boxShadow: "0 2px 8px rgba(255,107,107,0.4)",
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
              <Typography variant="body2" sx={{ color: "#0f172a", fontWeight: 500 }}>
                {mediaType === "video" && (
                  <Typography component="span" variant="body2" sx={{ color: "#ff2442", mr: 0.5, fontWeight: 600 }}>
                    视频
                  </Typography>
                )}
                {fileInfo.name}
                <Typography component="span" variant="body2" sx={{ color: "#94a3b8", ml: 1 }}>
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
              style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 32, gap: 8 }}
            >
              <CloudUploadIcon sx={{ fontSize: 44, color: "#ccc" }} />
              <Typography sx={{ color: "#666", fontWeight: 500, fontSize: "0.85rem", mt: 1 }}>
                {hintText}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                支持 {formatHint}，{sizeHint}
              </Typography>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      {error && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          <Typography variant="body2" sx={{ color: "#ef4444", mt: 1, fontSize: "0.85rem" }}>
            {error}
          </Typography>
        </motion.div>
      )}
    </>
  );
}
