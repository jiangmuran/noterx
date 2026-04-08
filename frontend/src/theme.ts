import { createTheme, type ThemeOptions } from "@mui/material/styles";

/**
 * NoteRx Clean Theme
 * Minimal, warm, professional. Inspired by Linear/Notion/Xiaohongshu.
 */

const themeOptions: ThemeOptions = {
  palette: {
    primary: {
      main: "#ff2442",
      light: "#ff6b81",
      dark: "#d91a36",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#8e8e8e",
      light: "#b0b0b0",
      dark: "#666666",
      contrastText: "#ffffff",
    },
    error: {
      main: "#ef4444",
      light: "#fca5a5",
      dark: "#dc2626",
    },
    warning: {
      main: "#f59e0b",
      light: "#fcd34d",
      dark: "#d97706",
    },
    info: {
      main: "#3b82f6",
      light: "#93c5fd",
      dark: "#2563eb",
    },
    success: {
      main: "#10b981",
      light: "#6ee7b7",
      dark: "#059669",
    },
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
    text: {
      primary: "#262626",
      secondary: "#8e8e8e",
    },
    divider: "#f0f0f0",
  },

  typography: {
    fontFamily: [
      "PingFang SC",
      "SF Pro Display",
      "-apple-system",
      "BlinkMacSystemFont",
      "Helvetica Neue",
      "sans-serif",
    ].join(","),
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontWeight: 700, fontSize: "2rem", lineHeight: 1.3 },
    h2: { fontWeight: 700, fontSize: "1.75rem", lineHeight: 1.35 },
    h3: { fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.4 },
    h4: { fontWeight: 600, fontSize: "1.25rem", lineHeight: 1.4 },
    h5: { fontWeight: 600, fontSize: "1.1rem", lineHeight: 1.5 },
    h6: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.5 },
    subtitle1: { fontWeight: 500, fontSize: "1rem", lineHeight: 1.6 },
    subtitle2: { fontWeight: 500, fontSize: "0.875rem", lineHeight: 1.6 },
    body1: { fontWeight: 400, fontSize: "1rem", lineHeight: 1.7 },
    body2: { fontWeight: 400, fontSize: "0.875rem", lineHeight: 1.7 },
    button: { fontWeight: 600, fontSize: "0.875rem" },
    caption: { fontWeight: 400, fontSize: "0.75rem", lineHeight: 1.5, color: "#8e8e8e" },
  },

  shape: {
    borderRadius: 12,
  },

  shadows: [
    "none",
    "0 1px 2px rgba(0,0,0,0.04)",
    "0 1px 4px rgba(0,0,0,0.05)",
    "0 2px 8px rgba(0,0,0,0.04)",
    "0 2px 12px rgba(0,0,0,0.04)",
    "0 4px 16px rgba(0,0,0,0.05)",
    "0 4px 16px rgba(0,0,0,0.05)",
    "0 4px 16px rgba(0,0,0,0.05)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
    "0 4px 16px rgba(0,0,0,0.06)",
  ],

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#ffffff",
        },
      },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          fontWeight: 600,
          borderRadius: 24,
          padding: "10px 28px",
          transition: "background-color 0.2s ease, box-shadow 0.2s ease",
        },
        sizeLarge: {
          padding: "14px 32px",
          fontSize: "1rem",
          borderRadius: 24,
        },
        sizeSmall: {
          padding: "6px 18px",
          fontSize: "0.8rem",
          borderRadius: 24,
        },
      },
      variants: [
        {
          props: { variant: "contained" as const, color: "primary" as const },
          style: {
            backgroundColor: "#ff2442",
            "&:hover": {
              backgroundColor: "#d91a36",
            },
          },
        },
        {
          props: { variant: "outlined" as const, color: "primary" as const },
          style: {
            borderWidth: 1.5,
            borderColor: "#ff2442",
            "&:hover": {
              borderWidth: 1.5,
              backgroundColor: "rgba(255, 36, 66, 0.04)",
            },
          },
        },
      ],
    },

    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid #f0f0f0",
          backgroundColor: "#ffffff",
          boxShadow: "none",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        rounded: {
          borderRadius: 16,
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 500,
          height: 30,
        },
        colorPrimary: {
          background: "rgba(255, 36, 66, 0.08)",
          color: "#d91a36",
          border: "1px solid rgba(255, 36, 66, 0.15)",
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "#e8e8e8",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#d0d0d0",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: "#ff2442",
              borderWidth: 2,
            },
          },
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.12)",
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          fontSize: "0.8rem",
          fontWeight: 500,
          backgroundColor: "#262626",
          padding: "6px 12px",
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 6,
          backgroundColor: "rgba(255, 36, 66, 0.1)",
        },
        bar: {
          borderRadius: 8,
          backgroundColor: "#ff2442",
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "background-color 0.15s ease",
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.04)",
          },
        },
      },
    },
  },
};

const theme = createTheme(themeOptions);

export default theme;
