"use client";

import { CalendarBlank } from "@phosphor-icons/react";
import { emptyStateFor } from "@/domain/onboarding";
import type { TenantData } from "@/lib/onboarding";
import { EmptyState } from "@/components/ui/EmptyState";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";

/** Today for a closer with no appointments: nothing to do, and it says so. */
export function CloserEmptyToday({ data }: { data: TenantData }) {
  const empty = emptyStateFor("closer_today", data.counts);
  const setters = data.members.filter((m) => m.membership.active && m.membership.role === "setter").length;
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <Surface padding="md" as="section" aria-label={empty.title} className="flex flex-col">
        <EmptyState icon={<CalendarBlank size={24} weight="bold" />} title={empty.title} evidence={`${empty.detail}. ${setters} ${setters === 1 ? "setter" : "setters"} on the team`} className="border-0 px-0 py-2 sm:px-0 sm:py-2" />
        <div className="mt-4 h-12">
          <Button size="lg" disabled leading={<CalendarBlank size={20} weight="bold" />} className="h-12 w-full rounded-md text-[17px]" data-testid="dock">
            Nothing to do
          </Button>
        </div>
      </Surface>
    </div>
  );
}
