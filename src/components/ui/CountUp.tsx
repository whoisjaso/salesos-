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
  const mv = useMotionValue(value);
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
    mv.set(from);
    const unsubscribe = mv.on("change", (v) => {
      el.textContent = format(v);
    });
    const controls = animate(mv, value, {
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
