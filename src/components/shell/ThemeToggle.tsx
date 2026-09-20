"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

type Theme = "dark" | "light";

const EVENT = "sos-theme-change";

function readTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function applyTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    window.localStorage.setItem("sos-theme", next);
  } catch {
    /* storage unavailable, the choice still applies for this page */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Sets data-theme on <html>. The inline script in layout applies the stored choice before paint. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  return (
    <button
      type="button"
      onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid h-8 w-8 place-items-center rounded-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg motion-reduce:transition-none",
        className,
      )}
    >
      {theme === "light" ? <Moon size={16} weight="bold" /> : <Sun size={16} weight="bold" />}
    </button>
  );
}
