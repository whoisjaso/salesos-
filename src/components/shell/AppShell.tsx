"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { MetricDefinitionProvider } from "@/components/metrics/MetricDefinitionProvider";
import { navFor, isActivePath } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export interface AppShellProps {
  tenantName?: string;
  children: ReactNode;
}

/**
 * Three tabs per role. Left rail on desktop, bottom tab bar on phones.
 * Signed out: no chrome, the page is the sign-in screen.
 */
export function AppShell({ tenantName = "Obavia", children }: AppShellProps) {
  const pathname = usePathname();
  const { session } = useSession();
  const items = session ? navFor(session.role) : [];

  if (!session) {
    return (
      <MetricDefinitionProvider>
        <main className="flex flex-1 flex-col px-4 pt-6 sm:px-6 sm:pt-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </MetricDefinitionProvider>
    );
  }

  return (
    <MetricDefinitionProvider>
      <div className="flex min-h-full">
        <nav aria-label="Primary" className="sticky top-0 hidden h-dvh w-[var(--rail-width)] shrink-0 flex-col border-r border-line bg-sunken lg:flex">
          <div className="flex h-[var(--topbar-height)] items-center px-5">
            <span className="text-[14px] font-semibold tracking-tight text-fg">{tenantName}</span>
          </div>
          <ul className="flex flex-col gap-0.5 px-3 py-3">
            {items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-2.5 rounded-sm px-2.5 text-[14px] font-medium transition-colors motion-reduce:transition-none",
                      active ? "bg-hover text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
                    )}
                  >
                    <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden className={cn(active ? "text-accent" : "text-fg-subtle")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center border-b border-line bg-base/85 px-4 backdrop-blur-md sm:px-6">
            <span className="truncate text-[14px] font-semibold tracking-tight text-fg">{tenantName}</span>
            <ThemeToggle className="ml-auto" />
          </header>

          <main className="flex-1 px-4 pb-[calc(var(--tabbar-height)+24px)] pt-5 sm:px-6 sm:pt-8 lg:pb-12">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>

        <nav
          aria-label="Primary, compact"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-base/80 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex h-[var(--tabbar-height)] items-stretch">
            {items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 text-[11px] leading-none",
                    active ? "font-semibold text-fg" : "font-medium text-fg-subtle",
                  )}
                >
                  <Icon size={24} weight={active ? "fill" : "regular"} aria-hidden className={active ? "text-accent" : undefined} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </MetricDefinitionProvider>
  );
}
