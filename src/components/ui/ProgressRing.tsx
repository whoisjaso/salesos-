import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

export interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  /** Text inside the ring. Default is the percent. */
  centerText?: string;
  className?: string;
}

export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 4,
  label,
  centerText,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-quart)] motion-reduce:transition-none"
        />
      </svg>
      <span className="tabular absolute text-[12px] font-medium text-fg">
        {centerText ?? formatPercent(clamped, { digits: 0 })}
      </span>
    </div>
  );
}
