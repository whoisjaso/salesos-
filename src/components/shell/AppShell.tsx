"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatAsOf } from "@/lib/format";
import { MetricDefinitionProvider } from "@/components/metrics/MetricDefinitionProvider";
import { NAV_ITEMS, isActivePath } from "./nav";
import { RoleSwitcher } from "./RoleSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export interface AppShellProps {
  tenantName?: string;
  /** ISO timestamp of the reading currently on screen. */
  asOf?: string;
  children: ReactNode;
}

const RAIL_SECTIONS: { title: string; hrefs: string[] }[] = [
  { title: "Overview", hrefs: ["/"] },
  { title: "Roles", hrefs: ["/owner", "/setter", "/closer"] },
  { title: "Team", hrefs: ["/team", "/coach", "/playbooks"] },
];

/**
 * Left rail on desktop, top bar everywhere, bottom tab bar on phones.
 * Action positions are fixed so nothing shifts under a finger during a call.
 */
export function AppShell({ tenantName = "Obavia", asOf, children }: AppShellProps) {
  const pathname = usePathname();
  const primary = NAV_ITEMS.filter((it) => it.primary).slice(0, 5);

  return (
    <MetricDefinitionProvider>
      <div className="flex min-h-full">
        <nav
          aria-label="Primary"
          className="sticky top-0 hidden h-dvh w-[var(--rail-width)] shrink-0 flex-col border-r border-line bg-sunken lg:flex"
        >
          <div className="flex h-[var(--topbar-height)] items-center gap-2.5 px-5">
            <span aria-hidden className="inline-grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-[12px] font-bold text-accent-fg">
              S
            </span>
            <span className="text-[14px] font-semibold tracking-tight text-fg">Sales OS</span>
          </div>
          <div className="flex flex-1 flex-col gap-6 px-3 py-3">
            {RAIL_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className="px-2 pb-1.5 text-[11px] font-medium text-fg-subtle">{section.title}</div>
                <ul className="flex flex-col gap-0.5">
                  {section.hrefs.map((href) => {
                    const item = NAV_ITEMS.find((it) => it.href === href)!;
                    const active = isActivePath(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-9 items-center gap-2.5 rounded-sm px-2 text-[13.5px] font-medium transition-colors motion-reduce:transition-none",
                            active ? "bg-hover text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
                          )}
                        >
                          <Icon size={17} weight={active ? "fill" : "regular"} aria-hidden className={cn(active ? "text-accent" : "text-fg-subtle")} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-5 py-4 text-[12px] text-fg-subtle">
            <div className="font-medium text-fg-muted">{tenantName}</div>
            <div>Internal pilot</div>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-3 border-b border-line bg-base/85 px-4 backdrop-blur-md sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <span aria-hidden className="inline-grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-[12px] font-bold text-accent-fg">
                S
              </span>
              <span className="truncate text-[14px] font-semibold tracking-tight text-fg">{tenantName}</span>
            </div>
            <div className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex">
              <span className="font-medium text-fg">{tenantName}</span>
              {asOf ? (
                <>
                  <span aria-hidden className="text-fg-faint">/</span>
                  <span className="tabular text-fg-muted">As of {formatAsOf(asOf)}</span>
                </>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {asOf ? <span className="tabular hidden text-[12px] text-fg-subtle sm:inline lg:hidden">As of {formatAsOf(asOf)}</span> : null}
              <RoleSwitcher />
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 px-4 pb-[calc(var(--tabbar-height)+24px)] pt-6 sm:px-6 sm:pt-8 lg:pb-12">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>

        <nav
          aria-label="Primary, compact"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-base/80 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex h-[var(--tabbar-height)] items-stretch">
            {primary.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px] leading-none",
                    active ? "font-semibold text-fg" : "font-medium text-fg-subtle",
                  )}
                >
                  <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden className={active ? "text-accent" : undefined} />
                  {item.shortLabel}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </MetricDefinitionProvider>
  );
}
