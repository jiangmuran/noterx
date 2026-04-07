import { Box, Typography, Chip, Stack } from "@mui/material";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const CATEGORIES = [
  { id: "food", label: "美食", icon: "🍜" },
  { id: "fashion", label: "穿搭", icon: "👗" },
  { id: "tech", label: "科技", icon: "📱" },
  { id: "travel", label: "旅行", icon: "✈️" },
  { id: "beauty", label: "美妆", icon: "💄" },
  { id: "fitness", label: "健身", icon: "💪" },
];

/**
 * 垂类选择器
 */
export default function CategorySelector({ value, onChange }: Props) {
  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        选择垂类
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat.id}
            label={`${cat.icon} ${cat.label}`}
            variant={value === cat.id ? "filled" : "outlined"}
            color={value === cat.id ? "primary" : "default"}
            onClick={() => onChange(cat.id)}
            sx={{
              fontWeight: 600,
              fontSize: "0.85rem",
              py: 2.5,
              px: 0.5,
            }}
          />
        ))}
      </Stack>
    </Box>
  );
}
