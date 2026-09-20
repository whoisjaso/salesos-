"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CaretRight, PhoneSlash } from "@phosphor-icons/react";
import { Surface } from "@/components/ui/Surface";
import { EmptyState } from "@/components/ui/EmptyState";
import { reviewableCalls, type Viewer } from "@/lib/review";
import { formatDateTimeIn, TENANT_TZ } from "@/lib/workspace-setter";
import { initials } from "@/components/workspace/NextUp";

/** Reviewable calls for the viewer: own calls for a rep, every call for the owner. One row: avatar, name, one word, one time. */
export function ReviewList({ viewer }: { viewer: Viewer }) {
  const rows = useMemo(() => reviewableCalls(viewer), [viewer]);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">Calls</h2>

      {rows.length === 0 ? (
        <EmptyState icon={<PhoneSlash size={28} aria-hidden />} title="No calls to review" evidence="A call shows up here once it has ended and a transcript exists." />
      ) : (
        <Surface padding="none" as="section" aria-label="Calls to review">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.callId} data-testid="review-row">
                <Link href={`/review?call=${r.callId}`} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-hover motion-reduce:transition-none">
                  <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg" aria-hidden>
                    {initials(r.contact.displayName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium leading-tight text-fg">{r.contact.displayName}</span>
                    <span className="tabular mt-0.5 block truncate text-[12px] text-fg-subtle">{r.call.startedAt ? formatDateTimeIn(r.call.startedAt, TENANT_TZ) : "Unknown time"}</span>
                  </span>
                  <span className="shrink-0 text-[15px] text-fg-muted" data-testid="stage-word">
                    {r.hero.word}
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
