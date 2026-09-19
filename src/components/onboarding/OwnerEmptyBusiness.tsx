"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CaretRight, PlugsConnected, UploadSimple, UsersThree } from "@phosphor-icons/react";
import { emptyStateFor } from "@/domain/onboarding";
import { buildOwnerView } from "@/lib/owner-model";
import type { TenantData } from "@/lib/onboarding";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { HeroTile } from "@/components/owner/HeroTile";
import { ChecklistCard } from "./ChecklistCard";

const ACTION_HREF: Record<string, string> = { connect_source: "/connect", import_history: "/import", invite_team: "/team" };
const ACTION_ICON = { connect_source: PlugsConnected, import_history: UploadSimple, invite_team: UsersThree } as const;

/**
 * Business for a brand-new tenant: the honest hero (no leads, one line, one action), the two
 * other ways forward as rows, then the checklist. Once a lead lands, the real hero takes over,
 * computed from the tenant's own rows.
 */
export function OwnerEmptyBusiness({ data }: { data: TenantData }) {
  const empty = emptyStateFor("owner_business", data.counts);
  const view = useMemo(() => (empty.empty ? null : buildOwnerView(data.dataset, data.now)), [empty.empty, data.dataset, data.now]);
  const cohort = view ? Object.values(view.cohorts)[0] : null;
  const [primary, ...rest] = empty.actions;
  const PrimaryIcon = primary ? ACTION_ICON[primary.id as keyof typeof ACTION_ICON] : null;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      {empty.empty ? (
        <section aria-label={empty.title} className="flex flex-col gap-3">
          <Surface padding="md" className="flex flex-col gap-4 lg:p-6">
            <div className="min-w-0">
              <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-[32px]">{empty.title}</h2>
              <div className="tabular mt-1 text-[13px] text-fg-muted">{empty.detail}</div>
            </div>
            {primary ? (
              <Button href={ACTION_HREF[primary.id] ?? "/"} size="lg" leading={PrimaryIcon ? <PrimaryIcon size={16} weight="bold" /> : undefined} className="w-full">
                {primary.label}
              </Button>
            ) : null}
          </Surface>
          {rest.length ? (
            <Surface padding="none">
              <ul className="divide-y divide-line">
                {rest.map((a) => {
                  const Icon = ACTION_ICON[a.id as keyof typeof ACTION_ICON];
                  return (
                    <li key={a.id}>
                      <Link href={ACTION_HREF[a.id] ?? "/"} className="flex h-12 items-center gap-3 px-4 text-[15px] text-fg transition-colors hover:bg-hover motion-reduce:transition-none">
                        <Icon size={16} weight="bold" aria-hidden className="shrink-0 text-fg-muted" />
                        <span className="min-w-0 flex-1 truncate">{a.label}</span>
                        <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          ) : null}
        </section>
      ) : cohort ? (
        <HeroTile economics={cohort.economics} flow={cohort.flow} cohortLabel={cohort.label} />
      ) : null}
      <ChecklistCard checklist={data.checklist} />
    </div>
  );
}
