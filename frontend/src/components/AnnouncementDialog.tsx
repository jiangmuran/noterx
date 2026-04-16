import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import FavoriteIcon from "@mui/icons-material/Favorite";
import GitHubIcon from "@mui/icons-material/GitHub";
import LanguageIcon from "@mui/icons-material/Language";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import CodeIcon from "@mui/icons-material/Code";

const STORAGE_KEY = "noterx_announcement_seen_v1";

const WaveSvg = () => (
  <svg
    viewBox="0 0 600 80"
    preserveAspectRatio="none"
    style={{ position: "absolute", bottom: -1, left: 0, width: "100%", height: 48 }}
  >
    <path d="M0 40 C150 80 350 0 600 40 L600 80 L0 80Z" fill="#fff" />
  </svg>
);

function LinkCard({
  icon,
  label,
  sublabel,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none", flex: 1, minWidth: 0 }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.5,
          borderRadius: "14px",
          border: "1px solid rgba(0,0,0,0.06)",
          background: "#fafafa",
          transition: "all 0.22s ease",
          cursor: "pointer",
          "&:hover": {
            borderColor: "rgba(255,36,66,0.25)",
            background: "rgba(255,36,66,0.03)",
            transform: "translateY(-2px)",
            boxShadow: "0 4px 16px rgba(255,36,66,0.08)",
          },
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, rgba(255,36,66,0.08), rgba(255,107,129,0.06))",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{ fontWeight: 700, fontSize: "0.82rem", color: "#1f1f1f", lineHeight: 1.3 }}
          >
            {label}
          </Typography>
          <Typography
            sx={{
              fontSize: "0.7rem",
              color: "#999",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sublabel}
          </Typography>
        </Box>
        <OpenInNewIcon sx={{ fontSize: 14, color: "#ccc", flexShrink: 0 }} />
      </Box>
    </a>
  );
}

const STATS = [
  {
    icon: <WhatshotIcon sx={{ fontSize: 20, color: "#ff2442" }} />,
    val: "100万+",
    label: "全网曝光",
  },
  {
    icon: <TrendingUpIcon sx={{ fontSize: 20, color: "#ff5c72" }} />,
    val: "10万+",
    label: "日均流量",
  },
  {
    icon: <CodeIcon sx={{ fontSize: 20, color: "#ff8fa3" }} />,
    val: "全开源",
    label: "MIT License",
  },
];

export default function AnnouncementDialog() {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const timer = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(timer);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const handleClose = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : "24px",
            overflow: "hidden",
            maxHeight: isMobile ? "100%" : "92vh",
            boxShadow: "0 24px 80px rgba(0,0,0,0.12)",
          },
        },
      }}
    >
      {/* ───── Hero ───── */}
      <Box
        sx={{
          background: "linear-gradient(145deg, #ff2442 0%, #ff5c72 40%, #ff8fa3 100%)",
          px: { xs: 3, sm: 4 },
          pt: { xs: 4, sm: 5 },
          pb: { xs: 5, sm: 6 },
          position: "relative",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute", width: 260, height: 260, borderRadius: "50%",
            background: "rgba(255,255,255,0.07)", top: -100, right: -60,
          }}
        />
        <Box
          sx={{
            position: "absolute", width: 160, height: 160, borderRadius: "50%",
            background: "rgba(255,255,255,0.05)", bottom: 10, left: -50,
          }}
        />
        <Box
          sx={{
            position: "absolute", width: 80, height: 80, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)", top: "30%", left: "20%",
          }}
        />
        <WaveSvg />

        <IconButton
          onClick={handleClose}
          size="small"
          sx={{
            position: "absolute", top: 12, right: 12,
            color: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(8px)",
            background: "rgba(255,255,255,0.1)",
            "&:hover": { color: "#fff", background: "rgba(255,255,255,0.2)" },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Box
            sx={{
              width: 56, height: 56, borderRadius: "16px",
              background: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(12px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              mx: "auto", mb: 2,
            }}
          >
            <FavoriteIcon sx={{ color: "#fff", fontSize: 28 }} />
          </Box>
          <Typography
            sx={{
              color: "#fff", fontWeight: 800,
              fontSize: { xs: "1.35rem", sm: "1.5rem" },
              letterSpacing: "-0.5px", mb: 1,
            }}
          >
            NoteRx 是公益项目
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.88)",
              fontSize: { xs: "0.85rem", sm: "0.9rem" },
              lineHeight: 1.7, maxWidth: 380, mx: "auto",
            }}
          >
            完全免费 · 完全开源 · 由团队自费运营
          </Typography>
        </Box>
      </Box>

      {/* ───── Content ───── */}
      <DialogContent
        sx={{
          px: { xs: 2.5, sm: 3.5 },
          py: { xs: 2.5, sm: 3 },
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { background: "rgba(0,0,0,0.1)", borderRadius: 2 },
        }}
      >
        {/* Stats row */}
        <Box sx={{ display: "flex", gap: { xs: 1, sm: 1.5 }, mb: 2.5 }}>
          {STATS.map((s) => (
            <Box
              key={s.label}
              sx={{
                flex: 1, textAlign: "center",
                py: { xs: 1.2, sm: 1.5 }, px: 0.5,
                borderRadius: "14px", background: "#fff",
                border: "1px solid rgba(0,0,0,0.05)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "center", mb: 0.5 }}>
                {s.icon}
              </Box>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "0.95rem", sm: "1.1rem" },
                  color: "#ff2442", lineHeight: 1.3,
                }}
              >
                {s.val}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.65rem", color: "#aaa", mt: 0.2,
                  fontWeight: 600, letterSpacing: "0.3px",
                }}
              >
                {s.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Links: GitHub + Homepage */}
        <Box
          sx={{
            display: "flex", gap: 1.5, mb: 2.5,
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <LinkCard
            icon={<GitHubIcon sx={{ fontSize: 20, color: "#333" }} />}
            label="开源仓库"
            sublabel="github.com/jiangmuran/noterx"
            href="https://github.com/jiangmuran/noterx"
          />
          <LinkCard
            icon={<LanguageIcon sx={{ fontSize: 20, color: "#ff2442" }} />}
            label="开发者主页"
            sublabel="jiangmuran.com"
            href="https://jiangmuran.com"
          />
        </Box>

        {/* Sustainability note */}
        <Box
          sx={{
            background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
            border: "1px solid rgba(245,158,11,0.18)",
            borderRadius: "14px", px: 2.5, py: 2, mb: 2.5,
          }}
        >
          <Typography
            sx={{ fontSize: "0.85rem", color: "#92400e", lineHeight: 1.75, fontWeight: 500 }}
          >
            由于服务器与 AI Token 成本持续增长，项目可能会在赞助资源耗尽后暂停服务。如果您觉得 NoteRx 有价值，欢迎通过赞助或合作帮助我们走得更远。
          </Typography>
        </Box>

        {/* Collaboration */}
        <Box
          sx={{
            display: "flex", alignItems: "flex-start", gap: 1.5,
            px: 2.5, py: 2, borderRadius: "14px",
            border: "1px solid rgba(0,0,0,0.05)", background: "#fcfcfc", mb: 2.5,
          }}
        >
          <HandshakeOutlinedIcon
            sx={{ color: "#ff2442", mt: 0.2, fontSize: 22, flexShrink: 0 }}
          />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.92rem", mb: 0.5, color: "#1f1f1f" }}>
              广告位招租 · 有偿合作
            </Typography>
            <Typography sx={{ fontSize: "0.82rem", color: "#888", lineHeight: 1.7 }}>
              我们开放广告位与商业合作。如有赞助、推广、技术合作意向，欢迎来信并附上联系方式、合作事由与意向报价。
            </Typography>
          </Box>
        </Box>

        {/* Contact email */}
        <Box
          sx={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 1, py: 1.2, borderRadius: "12px",
            background: "rgba(255,36,66,0.03)",
            border: "1px solid rgba(255,36,66,0.08)", mb: 3,
          }}
        >
          <EmailOutlinedIcon sx={{ fontSize: 16, color: "#ff6b81" }} />
          <Typography sx={{ fontSize: "0.82rem", color: "#666" }}>
            合作联系{" "}
            <a
              href="mailto:jmr@jiangmuran.com"
              style={{ color: "#ff2442", fontWeight: 700, textDecoration: "none" }}
            >
              jmr@jiangmuran.com
            </a>
          </Typography>
        </Box>

        {/* CTA */}
        <Button
          variant="contained"
          color="primary"
          fullWidth
          size="large"
          onClick={handleClose}
          sx={{
            py: 1.6, fontSize: "0.95rem", fontWeight: 700,
            borderRadius: "14px", textTransform: "none",
          }}
        >
          好的，开始使用 NoteRx
        </Button>

        <Typography
          sx={{
            textAlign: "center", fontSize: "0.68rem",
            color: "#ccc", mt: 1.5, letterSpacing: "0.3px",
          }}
        >
          此弹窗仅在首次访问时展示
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
