import ReactECharts from "echarts-for-react";

interface Props {
  data: Record<string, number>;
}

const DIMENSION_LABELS: Record<string, string> = {
  content: "内容质量",
  visual: "视觉表现",
  growth: "增长策略",
  user_reaction: "用户反应",
  overall: "综合评分",
};

/**
 * ECharts 五维诊断雷达图
 */
export default function RadarChart({ data }: Props) {
  const indicators = Object.keys(DIMENSION_LABELS).map((key) => ({
    name: DIMENSION_LABELS[key],
    max: 100,
  }));

  const values = Object.keys(DIMENSION_LABELS).map((key) => data[key] ?? 50);

  const option = {
    radar: {
      indicator: indicators,
      shape: "polygon" as const,
      splitNumber: 4,
      axisName: { color: "#6b7280", fontSize: 12 },
      splitLine: { lineStyle: { color: "#e5e7eb" } },
      splitArea: {
        areaStyle: { color: ["#f0fdf4", "#ecfdf5", "#d1fae5", "#a7f3d0"] },
      },
      axisLine: { lineStyle: { color: "#d1d5db" } },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: values,
            name: "诊断评分",
            areaStyle: { color: "rgba(16, 185, 129, 0.2)" },
            lineStyle: { color: "#10b981", width: 2 },
            itemStyle: { color: "#10b981" },
          },
        ],
      },
    ],
    tooltip: {},
  };

  return <ReactECharts option={option} style={{ height: 320 }} />;
}
