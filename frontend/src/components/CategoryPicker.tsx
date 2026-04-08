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
              px: 1.5,
              py: 0.6,
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 500,
              transition: "all 0.15s ease",
              userSelect: "none",
              ...(selected
                ? {
                    bgcolor: "#ff2442",
                    color: "#fff",
                  }
                : {
                    bgcolor: "#f5f5f5",
                    color: "#666",
                    "&:hover": {
                      bgcolor: "#eee",
                      color: "#262626",
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
