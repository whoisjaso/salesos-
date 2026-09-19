"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Funnel as FunnelIcon } from "@phosphor-icons/react";
import { formatCount } from "@/lib/format";
import { cohortKeyId, type CohortKey, type OwnerView } from "@/lib/owner-model";
import { Segmented } from "./Segmented";
import { CohortSheet } from "./CohortSheet";
import { HeroTile } from "./HeroTile";
import { FixFirst } from "./FixFirst";
import type { CoachingOwner } from "@/domain/types";
import { MoneyView } from "./MoneyView";
import { SourceView } from "./SourceView";
import { useTenantData } from "@/lib/onboarding";
import { OwnerEmptyBusiness } from "@/components/onboarding/OwnerEmptyBusiness";

type ViewId = "now" | "money" | "source";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "money", label: "Money" },
  { id: "source", label: "Source" },
];

export interface OwnerDashboardProps {
  view: OwnerView;
}

/**
 * Business: Now / Money / Source. Team has its own tab. One segmented control at the top;
 * the cohort filter lives in the hero's Details sheet and surfaces as a single icon only
 * while a narrower cohort is on.
 */
export function OwnerDashboard({ view }: OwnerDashboardProps) {
  const [owners, setOwners] = useState<Record<string, CoachingOwner>>({});
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<ViewId>("now");
  const [cohortKey, setCohortKey] = useState<CohortKey>({ path: "all", tier: "all" });
  const [cohortOpen, setCohortOpen] = useState(false);
  const tenantData = useTenantData();
  const cohort = view.cohorts[cohortKeyId(cohortKey)];
  const filtered = cohortKey.path !== "all" || cohortKey.tier !== "all";
  const summary = `${formatCount(cohort.assigned)} assigned`;

  // A business created through onboarding has its own rows (zero on day one), not the fixture's.
  if (!tenantData.demo) return <OwnerEmptyBusiness data={tenantData} />;

  const enter = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <Segmented label="View" options={VIEWS} value={tab} onChange={setTab} />
        {filtered ? (
          <button
            type="button"
            onClick={() => setCohortOpen(true)}
            aria-label={`Cohort filter, ${cohort.label}. Open.`}
            className="relative inline-grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-accent bg-raised text-accent transition-colors hover:bg-hover motion-reduce:transition-none"
          >
            <FunnelIcon size={16} weight="fill" aria-hidden />
            <span aria-hidden className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-base" />
          </button>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${tab}-${cohort.key}`} {...enter}>
          {tab === "now" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-5">
              <HeroTile economics={cohort.economics} flow={cohort.flow} cohortLabel={cohort.label} onOpenCohort={() => setCohortOpen(true)} />
              <FixFirst cards={cohort.cards} cohortLabel={cohort.label} owners={owners} onAssign={(id, o) => setOwners((prev) => ({ ...prev, [id]: o }))} trust={view.trust} />
            </div>
          ) : null}
          {tab === "money" ? <MoneyView economics={cohort.economics} /> : null}
          {tab === "source" ? <SourceView /> : null}
        </motion.div>
      </AnimatePresence>

      <CohortSheet open={cohortOpen} onClose={() => setCohortOpen(false)} value={cohortKey} onChange={setCohortKey} summary={summary} />
    </>
  );
}
