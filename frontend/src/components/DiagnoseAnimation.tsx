import { Box, Typography, LinearProgress, Stack } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

interface Step {
  label: string;
  icon: string;
  duration: number;
}

interface Props {
  currentStep: number;
  steps: Step[];
}

/**
 * 诊断过程动画
 */
export default function DiagnoseAnimation({ currentStep, steps }: Props) {
  const progress = Math.min(((currentStep + 1) / steps.length) * 100, 100);

  return (
    <Stack spacing={3} alignItems="center">
      {/* 当前步骤大图标 */}
      <Box
        sx={{
          position: "relative",
          width: 80,
          height: 80,
          borderRadius: "50%",
          bgcolor: "primary.light",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "pulse 1.5s ease-in-out infinite",
          "@keyframes pulse": {
            "0%, 100%": { opacity: 1, transform: "scale(1)" },
            "50%": { opacity: 0.7, transform: "scale(1.05)" },
          },
        }}
      >
        <Typography fontSize={36}>{steps[currentStep]?.icon ?? "🔍"}</Typography>
        <Box
          sx={{
            position: "absolute",
            bottom: -4,
            right: -4,
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: 2,
          }}
        >
          {currentStep + 1}
        </Box>
      </Box>

      {/* 当前步骤名 */}
      <Typography variant="h6" color="primary.dark" fontWeight={600}>
        {steps[currentStep]?.label ?? "处理中..."}
      </Typography>

      {/* 进度条 */}
      <Box sx={{ width: "100%" }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: "grey.100",
            "& .MuiLinearProgress-bar": {
              background: "linear-gradient(90deg, #10b981, #14b8a6)",
              borderRadius: 4,
            },
          }}
        />
      </Box>

      {/* 步骤列表 */}
      <Box sx={{ width: "100%", maxHeight: 220, overflowY: "auto", textAlign: "left" }}>
        {steps.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <Box
              key={i}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 0.75,
                px: 1.5,
                borderRadius: 1,
                bgcolor: active ? "primary.light" : done ? "#f0fdf4" : "transparent",
                opacity: !done && !active ? 0.35 : 1,
                transition: "all 0.3s",
              }}
            >
              {done ? (
                <CheckCircleIcon sx={{ fontSize: 18, color: "primary.main" }} />
              ) : active ? (
                <Typography fontSize={16}>{step.icon}</Typography>
              ) : (
                <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: "text.disabled" }} />
              )}
              <Typography variant="body2" fontWeight={active ? 600 : 400}>
                {step.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
