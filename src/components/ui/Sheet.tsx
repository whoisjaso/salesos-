"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Right on desktop. On phones the sheet always rises from the bottom. */
  side?: "right" | "left";
  width?: number;
  footer?: ReactNode;
}

const subscribeNoop = () => () => {};

/** Side drawer for drill-downs. Escape and backdrop close it; focus lands on the close control. */
export function Sheet({ open, onClose, title, description, children, side = "right", width = 440, footer }: SheetProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const x = side === "right" ? 24 : -24;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 cursor-default bg-[rgba(0,0,0,0.45)]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            initial={reduce ? false : { opacity: 0, x, y: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, x }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            style={{ ["--sheet-w" as string]: `${width}px` }}
            className={cn(
              "absolute flex flex-col border-line-strong bg-overlay shadow-lg",
              "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-lg border-t",
              "sm:inset-y-0 sm:max-h-none sm:w-[min(var(--sheet-w),92vw)] sm:rounded-none",
              side === "right" ? "sm:left-auto sm:right-0 sm:border-l sm:border-t-0" : "sm:right-auto sm:left-0 sm:border-r sm:border-t-0",
            )}
          >
            <header className="flex items-start gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-[15px] font-semibold text-fg">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-0.5 text-[13px] text-fg-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 -mt-1 inline-grid h-8 w-8 shrink-0 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg"
              >
                <X size={16} weight="bold" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <footer className="border-t border-line px-5 py-3">{footer}</footer> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
