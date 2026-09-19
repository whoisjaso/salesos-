import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Field {
  label: string;
  value: ReactNode;
}

/**
 * A plain list of label and value pairs for a Details sheet. No borders, no chips: the sheet is
 * the one place a screen's facts live, so each line is just the label and the value.
 */
export function Fields({ items, className }: { items: Field[]; className?: string }) {
  return (
    <dl className={cn("flex flex-col divide-y divide-line", className)}>
      {items.map((f) => (
        <div key={f.label} className="flex flex-col gap-0.5 py-2.5">
          <dt className="section-label">{f.label}</dt>
          <dd className="text-[14px] leading-snug text-fg">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
