import { createTheme } from "@mui/material/styles";

/**
 * 薯医 NoteRx 全局 MUI 主题
 * 品牌色：翡翠绿 #10b981 + 青绿 #14b8a6
 */
const theme = createTheme({
  palette: {
    primary: {
      main: "#10b981",
      light: "#6ee7b7",
      dark: "#059669",
      contrastText: "#fff",
    },
    secondary: {
      main: "#14b8a6",
      light: "#5eead4",
      dark: "#0d9488",
    },
    error: {
      main: "#ef4444",
    },
    warning: {
      main: "#f59e0b",
    },
    info: {
      main: "#3b82f6",
    },
    background: {
      default: "#f8faf9",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: [
      "Inter",
      "SF Pro Display",
      "-apple-system",
      "PingFang SC",
      "Noto Sans SC",
      "sans-serif",
    ].join(","),
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          fontWeight: 600,
          borderRadius: 12,
          padding: "10px 24px",
        },
      },
      variants: [
        {
          props: { variant: "contained" as const, color: "primary" as const },
          style: {
            background: "linear-gradient(135deg, #10b981, #14b8a6)",
            "&:hover": {
              background: "linear-gradient(135deg, #059669, #0d9488)",
            },
          },
        },
      ],
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

export default theme;
