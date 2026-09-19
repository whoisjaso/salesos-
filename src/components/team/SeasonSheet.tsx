"use client";

import type { ReactNode } from "react";
import { Flame, HourglassMedium, PauseCircle } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import type { LeaderboardRow } from "@/domain/types";
import type { LevelState, PlayerState } from "@/domain/game";
import { XP_TABLE } from "@/domain/game";
import type { LeaderboardPolicy } from "@/domain/leaderboard";
import type { GuardrailCounts } from "@/lib/team-data";
import { formatBasis, formatCount } from "@/lib/format";

export interface SeasonSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  daysLeft: number;
  /** My commercial track, or the pooled team track for the owner. */
  level: LevelState;
  streakDays: number;
  /** Quality gate reasons when XP is paused. Empty means running. */
  pausedReasons?: string[];
  /** The current user's comparable row. Omitted for the owner. */
  myRow?: LeaderboardRow;
  /** Owner: the ring is the whole team's. */
  team?: boolean;
  descriptive: boolean;
  /** The rep's three tracks and recent verified events. Omitted for the owner. */
  player?: PlayerState | null;
  policy: LeaderboardPolicy;
  guardrails: GuardrailCounts;
}

const TRACKS: { key: "commercial" | "mastery" | "team"; label: string }[] = [
  { key: "commercial", label: "Cash" },
  { key: "mastery", label: "Craft" },
  { key: "team", label: "Team" },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-3 first:pt-0">
      <dt className="text-[13px] font-medium text-fg-muted">{label}</dt>
      <dd className="tabular text-[13.5px] leading-relaxed text-fg">{children}</dd>
    </div>
  );
}

/**
 * Everything the season hero used to say, behind one tap: level and XP, streak,
 * rank or provisional state, XP pauses, the three tracks, recent events, and the
 * rules and guardrails that used to sit behind the info icon (SOS-14, SOS-15).
 */
export function SeasonSheet({ open, onClose, title, daysLeft, level, streakDays, pausedReasons = [], myRow, team = false, descriptive, player, policy, guardrails }: SeasonSheetProps) {
  const toNext = level.xpForNextLevel === null ? null : level.xpForNextLevel - level.xp;
  const paused = pausedReasons.length > 0;
  const rules: { title: string; body: string }[] = [
    { title: "Metric", body: `${formatBasis(policy.basis)} per assigned opportunity` },
    { title: "Eligible", body: `Active, reconciled data, ${policy.minMaturedSample}+ matured` },
    { title: "Ties", body: "Same value, order by name" },
    { title: "Paused when", body: "Unresolved attendance or unlinked payments" },
    { title: "Appeals", body: "Inspect counted opportunities, request a correction" },
    { title: "XP", body: "Verified stage events only, never pay" },
  ];
  const counts: { label: string; value: string }[] = [
    { label: "Opt-outs", value: formatCount(guardrails.optOuts) },
    { label: "Complaints", value: guardrails.complaints === null ? "Not tracked" : formatCount(guardrails.complaints) },
    { label: "Refunds", value: formatCount(guardrails.refunds) },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={title} description={`${daysLeft} days left`}>
      <dl className="flex flex-col divide-y divide-line">
        <Row label={team ? "Team level" : "Level"}>
          <span className="font-semibold">L{level.level}</span>
          <span className="text-fg-muted">
            {" "}
            {formatCount(level.xp)} XP
            {toNext !== null ? `, ${formatCount(toNext)} to next` : ", max level"}
          </span>
        </Row>
        <Row label="Streak">
          <span className="inline-flex items-center gap-1">
            <Flame size={13} weight="fill" aria-hidden className="text-fg-subtle" />
            {streakDays} {streakDays === 1 ? "day" : "days"}
          </span>
        </Row>
        {!team ? (
          <Row label="Rank">
            {myRow ? (
              myRow.rank !== null ? (
                <span>
                  #{myRow.rank}
                  {descriptive ? <span className="text-fg-muted">, descriptive</span> : null}
                </span>
              ) : (
                <span className="flex items-start gap-1.5">
                  <HourglassMedium size={13} weight="bold" aria-hidden className="mt-1.5 shrink-0 text-fg-subtle" />
                  <span>
                    Provisional
                    {myRow.provisionalReason ? <span className="text-fg-muted">, {myRow.provisionalReason}</span> : null}
                  </span>
                </span>
              )
            ) : (
              "No row this season"
            )}
          </Row>
        ) : null}
        <Row label="XP state">
          {paused ? (
            <span className="inline-flex items-start gap-1.5 text-perf-attention">
              <PauseCircle size={13} weight="bold" aria-hidden className="mt-1 shrink-0" />
              <span>Paused: {pausedReasons.join("; ")}</span>
            </span>
          ) : (
            "Running"
          )}
        </Row>
        {player ? (
          <Row label="Tracks">
            {TRACKS.map((t) => `${t.label} L${player[t.key].level}, ${formatCount(player[t.key].xp)} XP`).join(". ")}
          </Row>
        ) : null}
        {player && player.recent.length ? (
          <Row label="Recent">
            <ul className="flex flex-col gap-0.5">
              {player.recent.map((e) => (
                <li key={e.evidenceRef}>
                  {XP_TABLE[e.kind].label} <span className="text-fg-subtle">+{XP_TABLE[e.kind].xp}</span>
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
      </dl>

      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-medium text-fg-subtle">Rules</h3>
        <span className="text-[12px] text-fg-subtle">{policy.policyVersion}</span>
      </div>
      <dl className="flex flex-col divide-y divide-line">
        {rules.map((r) => (
          <div key={r.title} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-3 first:pt-0">
            <dt className="text-[13px] font-medium text-fg-muted">{r.title}</dt>
            <dd className="text-[13.5px] leading-relaxed text-fg">{r.body}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-medium text-fg-subtle">Guardrails</h3>
        <span className="text-[12px] text-fg-subtle">Rise pauses XP</span>
      </div>
      <dl className="surface flex divide-x divide-line">
        {counts.map((c) => (
          <div key={c.label} className="flex flex-1 flex-col items-center gap-0.5 py-3">
            <dd className="tabular text-[17px] font-semibold text-fg">{c.value}</dd>
            <dt className="text-[12px] text-fg-subtle">{c.label}</dt>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
