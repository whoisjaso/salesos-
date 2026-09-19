"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export interface PersonOption {
  id: string;
  label: string;
  /** Small caption after the label, e.g. the role. */
  caption?: string;
}

export interface PersonSwitcherProps {
  options: PersonOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Tiny "signed in as" menu for the demo. Same shape as the role switcher in the top bar. */
export function PersonSwitcher({ options, value, onChange, className }: PersonSwitcherProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Signed in as ${current.label}. Change person.`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-2 rounded-sm border border-line-strong bg-raised pl-2.5 pr-2 text-[13px] font-medium text-fg transition-colors hover:bg-hover motion-reduce:transition-none"
      >
        <span>{current.label}</span>
        <CaretDown size={12} weight="bold" aria-hidden className="text-fg-subtle" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            id={id}
            role="menu"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-md border border-line-strong bg-overlay p-1 shadow-lg"
          >
            {options.map((o) => {
              const active = o.id === value;
              return (
                <li key={o.id} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] transition-colors hover:bg-hover motion-reduce:transition-none",
                      active ? "text-fg" : "text-fg-muted",
                    )}
                  >
                    <span className="flex-1 text-left">{o.label}</span>
                    {o.caption ? <span className="text-[11px] text-fg-subtle">{o.caption}</span> : null}
                    {active ? <Check size={13} weight="bold" aria-hidden className="text-accent" /> : null}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
