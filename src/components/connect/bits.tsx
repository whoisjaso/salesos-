"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

/** Clipboard with a short "Copied" state. Falls back to a hidden textarea when the API is unavailable. */
export function useCopy(holdMs = 1600) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (key: string, text: string) => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = fallbackCopy(text);
      }
      if (!ok) return false;
      setCopied(key);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), holdMs);
      return true;
    },
    [holdMs],
  );

  return { copied, copy };
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ copied, onCopy, label = "Copy" }: { copied: boolean; onCopy: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-live="polite"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-[12.5px] font-medium transition-colors motion-reduce:transition-none",
        copied ? "border-[color:var(--perf-strong-line)] text-perf-strong" : "border-line-strong text-fg-muted hover:bg-hover hover:text-fg",
      )}
    >
      {copied ? <Check size={13} weight="bold" aria-hidden /> : <Copy size={13} weight="bold" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

/** Mono block with a Copy control in the corner. */
export function MonoBlock({ text, label, copied, onCopy, className }: { text: string; label: string; copied: boolean; onCopy: () => void; className?: string }) {
  return (
    <div className={cn("rounded-sm border border-line bg-sunken", className)}>
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <span className="text-[12px] font-medium text-fg-subtle">{label}</span>
        <CopyButton copied={copied} onCopy={onCopy} />
      </div>
      <pre className="max-h-44 overflow-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-fg whitespace-pre-wrap break-all">{text}</pre>
    </div>
  );
}

export function CheckRows({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5 text-[14px] leading-snug text-fg">
          <span className="mt-0.5 inline-grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Check size={10} weight="bold" aria-hidden />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export function StepRows({ items }: { items: string[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((t, i) => (
        <li key={t} className="flex items-start gap-2.5 text-[14px] leading-snug text-fg-muted">
          <span className="tabular mt-px inline-grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line-strong text-[10px] font-semibold text-fg-subtle">{i + 1}</span>
          {t}
        </li>
      ))}
    </ol>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-[12px] font-medium uppercase tracking-[0.04em] text-fg-subtle", className)}>{children}</h3>;
}
