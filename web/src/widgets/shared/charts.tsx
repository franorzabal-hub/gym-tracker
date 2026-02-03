/** Reusable SVG chart components for the dashboard widget */
import { font } from "../../tokens.js";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showArea?: boolean;
  showDot?: boolean;
}

export function Sparkline({
  data,
  width = 200,
  height = 50,
  color = "var(--primary)",
  showArea = true,
  showDot = true,
}: SparklineProps) {
  if (data.length < 2) return null;

  const pad = 4;
  const dotR = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * w,
    y: pad + h - ((v - min) / range) * h,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];

  const areaPath = `M${points[0].x},${points[0].y} ${points
    .map((p) => `L${p.x},${p.y}`)
    .join(" ")} L${last.x},${pad + h} L${points[0].x},${pad + h} Z`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {showArea && (
        <path d={areaPath} fill={color} opacity={0.1} />
      )}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && (
        <circle cx={last.x} cy={last.y} r={dotR} fill={color} />
      )}
    </svg>
  );
}

interface BarChartProps {
  data: Array<{ label: string; value: number }>;
  width?: number;
  height?: number;
  color?: string;
  barRadius?: number;
}

export function BarChart({
  data,
  width = 200,
  height = 80,
  color = "var(--primary)",
  barRadius = 3,
}: BarChartProps) {
  if (data.length === 0) return null;

  const labelH = 16;
  const pad = 4;
  const chartH = height - labelH - pad;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const gap = 3;
  const barW = Math.max(4, (width - pad * 2 - gap * (data.length - 1)) / data.length);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / max) * chartH);
        const x = pad + i * (barW + gap);
        const y = pad + chartH - barH;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={barRadius}
              fill={color}
              opacity={i === data.length - 1 ? 1 : 0.6}
            />
            <text
              x={x + barW / 2}
              y={height - 2}
              textAnchor="middle"
              fontSize={font["2xs"]}
              fill="var(--text-secondary)"
              fontFamily="var(--font)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface HorizontalBarsProps {
  data: Array<{ label: string; value: number; suffix?: string }>;
  width?: number;
  rowHeight?: number;
  color?: string;
  barRadius?: number;
}

export function HorizontalBars({
  data,
  width = 260,
  rowHeight = 28,
  color = "var(--primary)",
  barRadius = 4,
}: HorizontalBarsProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value)) || 1;
  const labelW = 100;
  const valueW = 50;
  const barArea = width - labelW - valueW;

  return (
    <svg
      width={width}
      height={data.length * rowHeight}
      style={{ display: "block" }}
    >
      {data.map((d, i) => {
        const barW = Math.max(2, (d.value / max) * barArea);
        const y = i * rowHeight;
        return (
          <g key={i}>
            <text
              x={labelW - 8}
              y={y + rowHeight / 2 + 1}
              textAnchor="end"
              fontSize={font.sm}
              fill="var(--text)"
              fontFamily="var(--font)"
              dominantBaseline="middle"
              style={{ textTransform: "capitalize" } as any}
            >
              {d.label.length > 14 ? d.label.slice(0, 12) + ".." : d.label}
            </text>
            <rect
              x={labelW}
              y={y + 6}
              width={barW}
              height={rowHeight - 12}
              rx={barRadius}
              fill={color}
              opacity={0.7}
            />
            <text
              x={labelW + barW + 6}
              y={y + rowHeight / 2 + 1}
              fontSize={font.xs}
              fontWeight={600}
              fill="var(--text-secondary)"
              fontFamily="var(--font)"
              dominantBaseline="middle"
            >
              {formatValue(d.value)}{d.suffix || ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function formatValue(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v % 1 === 0 ? v.toString() : v.toFixed(1);
}
