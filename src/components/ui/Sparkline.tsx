import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Accessible description, e.g. "Show rate, last 8 weeks". */
  title: string;
  /** Stroke color token. Default is the muted text color so it never competes with the verdict outline. */
  stroke?: string;
  className?: string;
}

/** Tiny inline trend line. No axes, no labels; the surrounding tile carries the numbers. */
export function Sparkline({
  values,
  width = 88,
  height = 24,
  title,
  stroke = "var(--fg-subtle)",
  className,
}: SparklineProps) {
  const id = useId();
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = points.split(" ").at(-1)!.split(",");

  return (
    <svg
      role="img"
      aria-labelledby={id}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <title id={id}>{title}</title>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill="var(--fg)" />
    </svg>
  );
}
