import { cn } from "@/lib/cn";

export interface SkeletonProps {
  /** Any CSS width/height so the placeholder keeps the final layout's shape. */
  width?: number | string;
  height?: number | string;
  className?: string;
  label?: string;
}

/** Layout-preserving pending block. Announces "Pending" rather than showing a fake zero. */
export function Skeleton({ width = "100%", height = 16, className, label = "Pending" }: SkeletonProps) {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("skeleton block", className)}
      style={{ width, height }}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-busy="true" role="status" aria-label="Pending">
      {Array.from({ length: lines }).map((_, i) => (
        <span
          key={i}
          className="skeleton block h-3.5"
          style={{ width: i === lines - 1 ? "62%" : "100%" }}
        />
      ))}
    </div>
  );
}
