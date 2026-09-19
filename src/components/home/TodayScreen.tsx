"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Hero } from "./Hero";
import { OneNumber } from "./OneNumber";
import { PersonSwitcher } from "./PersonSwitcher";
import { RecentWins } from "./RecentWins";
import { TeamPulse } from "./TeamPulse";
import type { TodayData } from "./today-model";

const ROLE_CAPTION = { setter: "Setter", closer: "Closer", owner: "Owner" } as const;

export function TodayScreen({ data, defaultUserId }: { data: TodayData; defaultUserId: string }) {
  const [userId, setUserId] = useState(defaultUserId);
  const model = data.personas.find((p) => p.userId === userId) ?? data.personas[0];
  const subtitle = `${data.season.label}, ${data.season.daysLeft} ${data.season.daysLeft === 1 ? "day" : "days"} left`;

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={subtitle}
        actions={
          <PersonSwitcher
            value={model.userId}
            onChange={setUserId}
            options={data.personas.map((p) => ({ id: p.userId, label: p.role === "owner" ? "Owner" : p.firstName, caption: p.role === "owner" ? undefined : ROLE_CAPTION[p.role] }))}
          />
        }
      />
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3 sm:gap-4">
        <Hero model={model} />
        <OneNumber key={model.userId} model={model} seasonLabel={data.season.label} />
        <RecentWins wins={model.wins} now={data.now} personKey={model.userId} />
        <TeamPulse team={data.team} currentUserId={model.userId} />
      </div>
    </>
  );
}
