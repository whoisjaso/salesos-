"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Funnel as FunnelIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { cohortKeyId, type CohortKey, type OwnerView } from "@/lib/owner-model";
import { Segmented } from "./Segmented";
import { CohortSheet } from "./CohortSheet";
import { HeroTile } from "./HeroTile";
import { FixFirst } from "./FixFirst";
import { TrustLine } from "./TrustLine";
import { MoneyView } from "./MoneyView";
import { TeamView } from "./TeamView";
import { SourceView } from "./SourceView";

type ViewId = "now" | "money" | "team" | "source";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "money", label: "Money" },
  { id: "team", label: "Team" },
  { id: "source", label: "Source" },
];

export interface OwnerDashboardProps {
  view: OwnerView;
  subtitle: string;
}

export function OwnerDashboard({ view, subtitle }: OwnerDashboardProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<ViewId>("now");
  const [cohortKey, setCohortKey] = useState<CohortKey>({ path: "all", tier: "all" });
  const [cohortOpen, setCohortOpen] = useState(false);
  const cohort = view.cohorts[cohortKeyId(cohortKey)];
  const filtered = cohortKey.path !== "all" || cohortKey.tier !== "all";
  const summary = `${formatCount(cohort.assigned)} assigned`;

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
      <PageHeader
        title="Owner"
        subtitle={subtitle}
        actions={
          <>
            <Segmented label="View" options={VIEWS} value={tab} onChange={setTab} />
            <button
              type="button"
              onClick={() => setCohortOpen(true)}
              aria-label={`Cohort filter, ${filtered ? cohort.label : "all"}. Open.`}
              className={cn(
                "relative inline-grid h-8 w-8 shrink-0 place-items-center rounded-sm border bg-raised text-fg-muted transition-colors hover:bg-hover hover:text-fg motion-reduce:transition-none",
                filtered ? "border-accent text-accent" : "border-line-strong",
              )}
            >
              <FunnelIcon size={16} weight={filtered ? "fill" : "bold"} aria-hidden />
              {filtered ? <span aria-hidden className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-base" /> : null}
            </button>
          </>
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${tab}-${cohort.key}`} {...enter}>
          {tab === "now" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-5">
              <HeroTile economics={cohort.economics} flow={cohort.flow} cohortLabel={cohort.label} />
              <FixFirst cards={cohort.cards} cohortLabel={cohort.label} />
              <div className="lg:col-span-2">
                <TrustLine items={view.trust} />
              </div>
            </div>
          ) : null}
          {tab === "money" ? <MoneyView economics={cohort.economics} /> : null}
          {tab === "team" ? <TeamView players={view.players} capacity={view.capacity} seasonLabel={view.seasonLabel} /> : null}
          {tab === "source" ? <SourceView /> : null}
        </motion.div>
      </AnimatePresence>

      <CohortSheet open={cohortOpen} onClose={() => setCohortOpen(false)} value={cohortKey} onChange={setCohortKey} summary={summary} />
    </>
  );
}
