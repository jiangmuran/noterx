import { createTheme, type ThemeOptions } from "@mui/material/styles";

/**
 * NoteRx 主题：柔和层次、暖灰底、小红书红点缀，偏「耐看、舒服」。
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
      default: "#faf8f9",
      paper: "#ffffff",
    },
    text: {
      primary: "#1f1f1f",
      secondary: "#737373",
    },
    divider: "rgba(0, 0, 0, 0.06)",
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
    h1: { fontWeight: 700, fontSize: "2rem", lineHeight: 1.3, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, fontSize: "1.75rem", lineHeight: 1.35, letterSpacing: "-0.02em" },
    h3: { fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.4 },
    h4: { fontWeight: 600, fontSize: "1.25rem", lineHeight: 1.4 },
    h5: { fontWeight: 600, fontSize: "1.1rem", lineHeight: 1.5 },
    h6: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.5 },
    subtitle1: { fontWeight: 500, fontSize: "1rem", lineHeight: 1.6 },
    subtitle2: { fontWeight: 500, fontSize: "0.875rem", lineHeight: 1.6 },
    body1: { fontWeight: 400, fontSize: "1rem", lineHeight: 1.7 },
    body2: { fontWeight: 400, fontSize: "0.875rem", lineHeight: 1.7 },
    button: { fontWeight: 600, fontSize: "0.875rem", letterSpacing: "0.02em" },
    caption: { fontWeight: 400, fontSize: "0.75rem", lineHeight: 1.5, color: "#8e8e8e" },
  },

  shape: {
    borderRadius: 14,
  },

  shadows: [
    "none",
    "0 1px 2px rgba(15, 23, 42, 0.04)",
    "0 2px 8px rgba(15, 23, 42, 0.06)",
    "0 4px 16px rgba(15, 23, 42, 0.06)",
    "0 8px 24px rgba(15, 23, 42, 0.08)",
    "0 12px 32px rgba(15, 23, 42, 0.08)",
    "0 16px 40px rgba(15, 23, 42, 0.09)",
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
  ],

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#faf8f9",
          backgroundImage: "radial-gradient(ellipse 120% 80% at 50% -20%, rgba(255, 36, 66, 0.06), transparent 55%)",
          backgroundAttachment: "fixed",
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
          borderRadius: 14,
          padding: "10px 28px",
          transition: "background-color 0.22s ease, box-shadow 0.22s ease, transform 0.18s ease",
        },
        sizeLarge: {
          padding: "14px 32px",
          fontSize: "1rem",
          borderRadius: 14,
        },
        sizeSmall: {
          padding: "6px 18px",
          fontSize: "0.8rem",
          borderRadius: 12,
        },
      },
      variants: [
        {
          props: { variant: "contained" as const, color: "primary" as const },
          style: {
            background: "linear-gradient(135deg, #ff3d5c 0%, #ff2442 50%, #e61e3d 100%)",
            boxShadow: "0 4px 16px rgba(255, 36, 66, 0.28)",
            "&:hover": {
              background: "linear-gradient(135deg, #ff5269 0%, #ff3355 50%, #ff2442 100%)",
              boxShadow: "0 6px 22px rgba(255, 36, 66, 0.34)",
              transform: "translateY(-1px)",
            },
            "&:active": {
              transform: "translateY(0)",
            },
            "&.Mui-disabled": {
              background: "#ececec",
              boxShadow: "none",
              color: "#b0b0b0",
            },
          },
        },
        {
          props: { variant: "outlined" as const, color: "primary" as const },
          style: {
            borderWidth: 1.5,
            borderColor: "rgba(255, 36, 66, 0.45)",
            "&:hover": {
              borderWidth: 1.5,
              backgroundColor: "rgba(255, 36, 66, 0.06)",
              borderColor: "#ff2442",
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
          borderRadius: 18,
          border: "1px solid rgba(0, 0, 0, 0.05)",
          backgroundColor: "#ffffff",
          boxShadow: "0 8px 32px rgba(15, 23, 42, 0.06)",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        rounded: {
          borderRadius: 18,
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
          background: "rgba(255, 36, 66, 0.1)",
          color: "#c41e3a",
          border: "1px solid rgba(255, 36, 66, 0.12)",
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 14,
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "rgba(0, 0, 0, 0.08)",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "rgba(0, 0, 0, 0.12)",
            },
            "&.Mui-focused": {
              boxShadow: "0 0 0 3px rgba(255, 36, 66, 0.12)",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: "#ff2442",
              borderWidth: 2,
            },
          },
        },
      },
    },

    MuiStepper: {
      styleOverrides: {
        root: {
          paddingLeft: 0,
          paddingRight: 0,
        },
      },
    },

    MuiStepConnector: {
      styleOverrides: {
        line: {
          borderColor: "rgba(0, 0, 0, 0.08)",
        },
      },
    },

    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: "rgba(0, 0, 0, 0.12)",
          "&.Mui-active": {
            color: "#ff2442",
            filter: "drop-shadow(0 2px 6px rgba(255, 36, 66, 0.35))",
          },
          "&.Mui-completed": {
            color: "#ff6b81",
          },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          alignItems: "center",
        },
        colorWarning: {
          backgroundColor: "rgba(245, 158, 11, 0.08)",
          color: "#92400e",
          border: "1px solid rgba(245, 158, 11, 0.2)",
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 18,
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.14)",
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 10,
          fontSize: "0.8rem",
          fontWeight: 500,
          backgroundColor: "rgba(31, 31, 31, 0.92)",
          padding: "8px 14px",
          backdropFilter: "blur(8px)",
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
          transition: "background-color 0.18s ease, transform 0.15s ease",
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.05)",
          },
        },
      },
    },
  },
};

const theme = createTheme(themeOptions);

export default theme;
