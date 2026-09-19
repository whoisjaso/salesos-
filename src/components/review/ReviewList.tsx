"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CaretRight, PhoneSlash } from "@phosphor-icons/react";
import { Surface } from "@/components/ui/Surface";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { formatDuration, reviewableCalls, type Hero, type Viewer } from "@/lib/review";
import { formatDateTimeIn, TENANT_TZ } from "@/lib/workspace-setter";
import { initials } from "@/components/workspace/NextUp";
import { OutcomeChip } from "./OutcomeChip";
import { BAND_BORDER, BAND_ICON, BAND_TEXT } from "./StageStrip";

/** The stage the transcript cleared, with its percent and band. */
function StageChip({ hero }: { hero: Hero }) {
  const Icon = BAND_ICON[hero.band];
  return (
    <span className={cn("chip", BAND_BORDER[hero.band], BAND_TEXT[hero.band])} data-testid="stage-chip">
      <Icon size={12} weight="bold" aria-hidden />
      {hero.word}
      <span className="tabular text-fg-muted">{hero.percent}%</span>
    </span>
  );
}

/** Reviewable calls for the viewer: own calls for a rep, every call for the owner. */
export function ReviewList({ viewer }: { viewer: Viewer }) {
  const rows = useMemo(() => reviewableCalls(viewer), [viewer]);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">Calls</h2>
        <span className="tabular text-[13px] text-fg-subtle">{rows.length} scored</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<PhoneSlash size={28} aria-hidden />} title="No calls to review" evidence="A call shows up here once it has ended and a transcript exists. Calls made through the dialer or a connected Zoom or Meet recording feed this list." />
      ) : (
        <Surface padding="none" as="section" aria-label="Calls to review">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.callId} data-testid="review-row">
                <Link href={`/review?call=${r.callId}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover motion-reduce:transition-none">
                  <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg">{initials(r.contact.displayName)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-fg">{r.contact.displayName}</span>
                    <span className="block truncate text-[12px] text-fg-muted">
                      {r.call.startedAt ? formatDateTimeIn(r.call.startedAt, TENANT_TZ) : "Unknown time"}
                      <span aria-hidden> · </span>
                      {formatDuration(r.call.durationSeconds)}
                      {viewer.role === "owner" ? (
                        <>
                          <span aria-hidden> · </span>
                          {r.rep.displayName}
                        </>
                      ) : null}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StageChip hero={r.hero} />
                      <OutcomeChip outcome={r.outcome} />
                    </span>
                  </span>
                  <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
