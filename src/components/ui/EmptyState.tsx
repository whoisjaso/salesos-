import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  /** A Phosphor icon element. */
  icon?: ReactNode;
  title: string;
  /** What evidence is missing and what it would unlock. */
  evidence: string;
  /** The next legitimate setup action, usually a Button. */
  action?: ReactNode;
  className?: string;
}

/**
 * Empty states explain what evidence is needed and offer the next legitimate
 * action. They never invent a zero (SOS-20).
 */
export function EmptyState({ icon, title, evidence, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-md border border-dashed border-line-strong px-5 py-8 sm:px-8 sm:py-10",
        className,
      )}
    >
      {icon ? <div className="text-fg-subtle">{icon}</div> : null}
      <div className="max-w-[52ch]">
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{evidence}</p>
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
