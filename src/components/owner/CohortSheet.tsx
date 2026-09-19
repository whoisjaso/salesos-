"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { PATH_OPTIONS, TIER_OPTIONS, type CohortKey } from "@/lib/owner-model";
import { Segmented } from "./Segmented";

export interface CohortSheetProps {
  open: boolean;
  onClose: () => void;
  value: CohortKey;
  onChange: (key: CohortKey) => void;
  /** e.g. "38 assigned" */
  summary: string;
}

/** Entry path and lead tier. Every combination is precomputed, so switching is instant. */
export function CohortSheet({ open, onClose, value, onChange, summary }: CohortSheetProps) {
  const isDefault = value.path === "all" && value.tier === "all";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cohort"
      description={summary}
      width={380}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={isDefault} onClick={() => onChange({ path: "all", tier: "all" })}>
            Reset
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium text-fg-subtle">Entry path</span>
          <Segmented label="Entry path" size="md" options={PATH_OPTIONS} value={value.path} onChange={(path) => onChange({ ...value, path })} className="self-start" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium text-fg-subtle">Lead tier</span>
          <Segmented label="Lead tier" size="md" options={TIER_OPTIONS} value={value.tier} onChange={(tier) => onChange({ ...value, tier })} className="self-start" />
        </div>
      </div>
    </Sheet>
  );
}
