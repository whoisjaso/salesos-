"use client";

import { useMemo } from "react";
import { GraduationCap, Trophy } from "@phosphor-icons/react";
import { commissionSummary, tierPolicyFor } from "@/domain/cashTiers";
import { COACH_MIN_OPPORTUNITIES, emptyStateFor } from "@/domain/onboarding";
import { obaviaCommissionPolicies } from "@/fixtures/obavia";
import type { TenantData } from "@/lib/onboarding";
import { seasonFor } from "@/lib/owner-model";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Surface } from "@/components/ui/Surface";
import { CashHero } from "@/components/cash/CashHero";

export interface MeEmptyProps {
  data: TenantData;
  userId: string;
  role: "setter" | "closer";
}

/**
 * Me on day one: the same cash hero at $0 in the Coins tier, level 1 with an
 * empty ring, and the honest coaching line. Same components, real zeros.
 */
export function MeEmpty({ data, userId, role }: MeEmptyProps) {
  const season = useMemo(() => seasonFor(data.now), [data.now]);
  const policy = useMemo(() => tierPolicyFor(role), [role]);
  const summary = useMemo(() => commissionSummary(data.dataset, userId, { from: season.from, to: season.to }, data.now, obaviaCommissionPolicies), [data.dataset, userId, season, data.now]);
  const me = emptyStateFor("me", data.counts);
  const coach = emptyStateFor("coach", data.counts);

  return (
    <>
      <CashHero summary={summary} policy={policy} />
      <Surface padding="md" className="flex items-center gap-4">
        <Avatar userId={userId} size={64} ring={0} ringLabel="Level 1, 0% to next" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-semibold text-fg">Level 1</span>
            <span className="chip text-fg-muted">
              <Trophy size={12} weight="bold" aria-hidden />0 XP
            </span>
          </div>
          <div className="mt-0.5 text-[12px] text-fg-subtle">{season.label}. XP comes only from verified stage events</div>
        </div>
      </Surface>
      {me.empty ? (
        <EmptyState
          icon={<Trophy size={24} weight="bold" />}
          title={me.title}
          evidence={me.detail ?? ""}
          action={
            <Button href="/" size="md">
              {me.actions[0]?.label ?? "Collect more"}
            </Button>
          }
        />
      ) : null}
      {coach.empty ? <EmptyState icon={<GraduationCap size={24} weight="bold" />} title={coach.title} evidence={`${coach.detail}. Coaching starts at ${COACH_MIN_OPPORTUNITIES}`} /> : null}
    </>
  );
}

/** The owner's Me on day one: no recommendations, and why. */
export function CoachEmpty({ data }: { data: TenantData }) {
  const coach = emptyStateFor("coach", data.counts);
  if (!coach.empty) return null;
  return <EmptyState icon={<GraduationCap size={24} weight="bold" />} title={coach.title} evidence={`${coach.detail}. Coaching starts at ${COACH_MIN_OPPORTUNITIES}`} />;
}
