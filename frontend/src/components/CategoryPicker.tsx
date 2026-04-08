import { Box, Typography } from "@mui/material";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const CATEGORIES = [
  { key: "food", label: "美食" },
  { key: "fashion", label: "穿搭" },
  { key: "tech", label: "科技" },
  { key: "travel", label: "旅行" },
  { key: "beauty", label: "美妆" },
  { key: "fitness", label: "健身" },
  { key: "lifestyle", label: "生活" },
  { key: "home", label: "家居" },
];

export default function CategoryPicker({ value, onChange }: Props) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {CATEGORIES.map((cat) => {
        const selected = value === cat.key;
        return (
          <Box
            key={cat.key}
            onClick={() => onChange(cat.key)}
            sx={{
              px: 1.65,
              py: 0.65,
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 600,
              transition: "all 0.2s ease",
              userSelect: "none",
              border: "1px solid transparent",
              ...(selected
                ? {
                    background: "linear-gradient(135deg, #ff4d64 0%, #e61e3d 100%)",
                    color: "#fff",
                    boxShadow: "0 4px 14px rgba(255, 36, 66, 0.35)",
                    borderColor: "rgba(255,255,255,0.2)",
                  }
                : {
                    bgcolor: "rgba(0,0,0,0.04)",
                    color: "text.secondary",
                    borderColor: "rgba(0,0,0,0.06)",
                    "&:hover": {
                      bgcolor: "rgba(255,36,66,0.08)",
                      color: "text.primary",
                      borderColor: "rgba(255,36,66,0.2)",
                      transform: "translateY(-1px)",
                    },
                  }),
            }}
          >
            <Typography sx={{ fontSize: "inherit", fontWeight: "inherit", lineHeight: 1.5 }}>
              {cat.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
