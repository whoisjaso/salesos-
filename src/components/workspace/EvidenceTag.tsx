import { Quotes, SealCheck, Sparkle } from "@phosphor-icons/react/dist/ssr";
import type { EvidenceLabel } from "@/lib/workspace-setter";
import { cn } from "@/lib/cn";

const SPEC: Record<EvidenceLabel, { icon: typeof Quotes; className: string }> = {
  "Customer-stated": { icon: Quotes, className: "text-fg-muted border-line-strong" },
  Verified: { icon: SealCheck, className: "text-perf-strong border-[color:var(--perf-strong-line)]" },
  "AI-proposed": { icon: Sparkle, className: "text-accent border-dashed border-line-strong" },
};

/** Tiny provenance label. Every assertion in a brief carries one (SOS-10). */
export function EvidenceTag({ label, className }: { label: EvidenceLabel; className?: string }) {
  const { icon: Icon, className: tone } = SPEC[label];
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-[4px] border px-1.5 text-[10.5px] font-medium leading-none whitespace-nowrap", tone, className)}>
      <Icon size={10} weight="bold" aria-hidden />
      {label}
    </span>
  );
}

/** Small label + value row used across briefs. */
export function BriefRowView({ label, text, evidence }: { label: string; text: string; evidence: EvidenceLabel }) {
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</span>
        <EvidenceTag label={evidence} />
      </div>
      <p className="text-[14px] leading-snug text-fg">{text}</p>
    </div>
  );
}
