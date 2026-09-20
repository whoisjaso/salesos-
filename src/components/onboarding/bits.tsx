"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { emptyProfile } from "@/domain/profile";
import { cn } from "@/lib/cn";
import { clientNow, DEMO_TENANT_ID } from "@/lib/onboarding";
import type { ProfilesContextValue } from "@/lib/profiles";
import { Button } from "@/components/ui/Button";

export const INPUT = "h-11 w-full min-w-0 rounded-sm border border-line-strong bg-sunken px-3 text-[16px] text-fg placeholder:text-fg-faint focus:border-line-focus focus:outline-none";
export const LABEL = "mb-1.5 block text-[12px] font-medium text-fg-subtle";
export const ease = [0.16, 1, 0.3, 1] as const;

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];
export const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "BRL", "AED", "SGD"];

/** Step dots with one word. Same shape as ProfileSetup and the Import screen. */
export function Dots({ steps, index, word, small }: { steps: number; index: number; word: string; small?: boolean }) {
  return (
    <header>
      <ol aria-label={`Step ${index + 1} of ${steps}`} className="flex items-center gap-1.5">
        {Array.from({ length: steps }, (_, i) => (
          <li
            key={i}
            aria-current={i === index ? "step" : undefined}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
              i === index ? "w-6 bg-accent" : i < index ? "w-1.5 bg-fg-muted" : "w-1.5 bg-line-strong",
            )}
          />
        ))}
      </ol>
      {small ? (
        <h2 className="mt-3 text-[20px] font-semibold leading-none tracking-tight text-fg">{word}</h2>
      ) : (
        <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-fg">{word}</h1>
      )}
    </header>
  );
}

/** Marks a provider step that runs without a real provider in the pilot (D04). */
export function SimulatedTag() {
  return <span className="tag text-fg-subtle">Simulated</span>;
}

/** One calm line. Never a color alone: the text carries the meaning. */
export function Refusal({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="mt-2 text-[13px] leading-snug text-perf-issue">
      {children}
    </p>
  );
}

export function useCopy(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(el);
      }
    }
    setCopied(true);
  };
  return { copied, copy };
}

export function CopyButton({ text, label = "Copy", size = "md", variant = "secondary", className }: { text: string; label?: string; size?: "sm" | "md" | "lg"; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <Button variant={variant} size={size} onClick={() => copy(text)} leading={copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />} className={className} aria-live="polite">
      {copied ? "Copied" : label}
    </Button>
  );
}

/** The origin for links in the pilot. Domain code never reads window; only this client helper does. */
export function origin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/**
 * Give a person who just joined a starting profile so ProfileSetup opens with
 * their name, not their id. Retries the handle once when it collides.
 */
export function seedProfile(profiles: ProfilesContextValue, userId: string, displayName: string) {
  if (profiles.list().some((p) => p.userId === userId)) return;
  const base = emptyProfile(DEMO_TENANT_ID, userId, displayName, clientNow());
  const first = profiles.save(base);
  if (first.ok) return;
  const suffix = userId.replace(/[^0-9a-z]/gi, "").slice(-3).toLowerCase();
  profiles.save({ ...base, handle: `${base.handle.slice(0, 16)}.${suffix}` });
}
