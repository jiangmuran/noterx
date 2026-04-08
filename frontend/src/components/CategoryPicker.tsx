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
              px: 1.75,
              py: 0.7,
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 600,
              transition: "all 0.25s cubic-bezier(0.2,0,0.2,1)",
              userSelect: "none",
              border: "1.5px solid transparent",
              ...(selected
                ? {
                    background: "linear-gradient(135deg, #ff4d64 0%, #e61e3d 100%)",
                    color: "#fff",
                    boxShadow: "0 4px 16px rgba(255, 36, 66, 0.3)",
                    borderColor: "rgba(255,255,255,0.2)",
                    transform: "scale(1.02)",
                  }
                : {
                    bgcolor: "rgba(0,0,0,0.03)",
                    color: "text.secondary",
                    borderColor: "rgba(0,0,0,0.06)",
                    "&:hover": {
                      bgcolor: "rgba(255,36,66,0.06)",
                      color: "text.primary",
                      borderColor: "rgba(255,36,66,0.18)",
                      transform: "translateY(-1px)",
                      boxShadow: "0 2px 8px rgba(255,36,66,0.12)",
                    },
                    "&:active": {
                      transform: "scale(0.97)",
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
