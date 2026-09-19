"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

export interface CountUpProps {
  value: number;
  /** Formats the in-flight number. Default: grouped integer. */
  format?: (n: number) => string;
  /** Delay in seconds before the count starts, for staggered groups. */
  delay?: number;
  className?: string;
}

/**
 * Animated number. Server render and reduced-motion both show the final value.
 * The spring runs once on mount and again when `value` changes.
 */
export function CountUp({ value, format = formatCount, delay = 0, className }: CountUpProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  /** Normalized progress 0..1 so the spring settles in the same time for 21 and 68,600,000. */
  const mv = useMotionValue(1);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format(value);
      previous.current = value;
      return;
    }
    const from = previous.current ?? 0;
    previous.current = value;
    mv.set(0);
    const unsubscribe = mv.on("change", (p) => {
      el.textContent = format(from + (value - from) * p);
    });
    const controls = animate(mv, 1, {
      type: "spring",
      stiffness: 90,
      damping: 24,
      mass: 1,
      delay,
    });
    return () => {
      unsubscribe();
      controls.stop();
    };
  }, [value, reduce, format, delay, mv]);

  return (
    <span ref={ref} className={cn("tabular", className)} aria-label={format(value)}>
      {format(value)}
    </span>
  );
}
