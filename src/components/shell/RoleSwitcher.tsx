"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretDown, Check } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isActivePath } from "./nav";

/** Compact menu of the role views. Mirrors the rail so every route is reachable from the top bar on any screen. */
export function RoleSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const current = NAV_ITEMS.find((it) => isActivePath(pathname, it.href)) ?? NAV_ITEMS[0];
  const CurrentIcon = current.icon;

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
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-2 rounded-sm border border-line-strong bg-raised px-2.5 text-[13px] font-medium text-fg transition-colors hover:bg-hover motion-reduce:transition-none"
      >
        <CurrentIcon size={15} weight="bold" aria-hidden className="text-fg-muted" />
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
            className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-md border border-line-strong bg-overlay p-1 shadow-lg"
          >
            {NAV_ITEMS.map((it) => {
              const active = isActivePath(pathname, it.href);
              const Icon = it.icon;
              return (
                <li key={it.href} role="none">
                  <Link
                    role="menuitem"
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-sm px-2 text-[13px] transition-colors hover:bg-hover motion-reduce:transition-none",
                      active ? "text-fg" : "text-fg-muted",
                    )}
                  >
                    <Icon size={15} weight="bold" aria-hidden />
                    <span className="flex-1">{it.label}</span>
                    {active ? <Check size={13} weight="bold" aria-hidden className="text-accent" /> : null}
                  </Link>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
