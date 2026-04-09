import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { getBaseline } from "../utils/api";

interface Props {
  category: string;
  userTitle: string;
  userTags: string[];
}

interface Metric {
  label: string;
  userValue: number;
  avgValue: number;
  viralValue?: number;
  unit: string;
}

export default function BaselineComparison({ category, userTitle, userTags }: Props) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getBaseline(category);
        if (cancelled) return;

        const stats = data.stats ?? data;
        const nextMetrics: Metric[] = [
          {
            label: "标题字数",
            userValue: userTitle.length,
            avgValue: Math.round(Number(stats.avg_title_length ?? 0)),
            viralValue: Math.round(Number(stats.viral_avg_title_length ?? 0)),
            unit: "字",
          },
          {
            label: "标签数量",
            userValue: userTags.length,
            avgValue: Math.round(Number(stats.avg_tag_count ?? 0)),
            unit: "个",
          },
        ];

        if (stats.viral_rate !== undefined) {
          nextMetrics.push({
            label: "爆款率",
            userValue: 0,
            avgValue: Math.round(Number(stats.viral_rate) * 10) / 10,
            unit: "%",
          });
        }

        setMetrics(nextMetrics);
      } catch {
        setMetrics([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [category, userTitle, userTags]);

  if (loading || metrics.length === 0) return null;

  const maxValue =
    Math.max(...metrics.flatMap((metric) => [metric.userValue, metric.avgValue, metric.viralValue ?? 0])) * 1.2 || 100;

  return (
    <Stack spacing={2}>
      {metrics.filter((metric) => metric.userValue > 0).map((metric) => (
        <Box key={metric.label}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#505050", mb: 1 }}>
            {metric.label}
          </Typography>
          <Stack spacing={0.75}>
            <BarRow label="你的笔记" value={metric.userValue} maxValue={maxValue} color="#ff2442" unit={metric.unit} />
            <BarRow label="垂类平均" value={metric.avgValue} maxValue={maxValue} color="#ddd" unit={metric.unit} />
            {metric.viralValue !== undefined && metric.viralValue > 0 && (
              <BarRow label="爆款平均" value={metric.viralValue} maxValue={maxValue} color="#f59e0b" unit={metric.unit} />
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function BarRow({
  label,
  value,
  maxValue,
  color,
  unit,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  unit: string;
}) {
  const pct = Math.min((value / maxValue) * 100, 100);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography sx={{ fontSize: 11, color: "#999", width: 56, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 8, bgcolor: "#f5f5f5", borderRadius: 4, overflow: "hidden" }}>
        <Box sx={{ height: "100%", bgcolor: color, borderRadius: 4, width: `${pct}%`, transition: "width 0.8s ease" }} />
      </Box>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: "#262626",
          width: 40,
          textAlign: "right",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit}
      </Typography>
    </Box>
  );
}
