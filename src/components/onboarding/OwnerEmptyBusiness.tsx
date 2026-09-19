"use client";

import { useMemo } from "react";
import { PlugsConnected, Tray, UploadSimple, UsersThree } from "@phosphor-icons/react";
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
 * Business for a brand-new tenant: the checklist on top, then the honest hero.
 * No leads: "No leads yet" with the connected-sources count and three ways forward.
 * Once a lead lands, the real hero tile takes over, computed from the tenant's own rows.
 */
export function OwnerEmptyBusiness({ data }: { data: TenantData }) {
  const empty = emptyStateFor("owner_business", data.counts);
  const view = useMemo(() => (empty.empty ? null : buildOwnerView(data.dataset, data.now)), [empty.empty, data.dataset, data.now]);
  const cohort = view ? Object.values(view.cohorts)[0] : null;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <ChecklistCard checklist={data.checklist} />
      {empty.empty ? (
        <Surface padding="md" as="section" aria-label="No leads yet" className="flex flex-col gap-5 lg:p-6">
          <div className="flex items-start gap-3">
            <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-fg-subtle" aria-hidden>
              <Tray size={20} weight="bold" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-[32px]">{empty.title}</h2>
              <div className="tabular mt-1 text-[13px] text-fg-muted">{empty.detail}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {empty.actions.map((a, i) => {
              const Icon = ACTION_ICON[a.id as keyof typeof ACTION_ICON];
              return (
                <Button key={a.id} href={ACTION_HREF[a.id] ?? "/"} variant={i === 0 ? "primary" : "secondary"} size="lg" leading={<Icon size={16} weight="bold" />} className="w-full">
                  {a.label}
                </Button>
              );
            })}
          </div>
          <p className="text-[12px] text-fg-subtle">The first lead creates the first opportunity. Nothing here is estimated</p>
        </Surface>
      ) : cohort ? (
        <HeroTile economics={cohort.economics} flow={cohort.flow} cohortLabel={cohort.label} />
      ) : null}
    </div>
  );
}
