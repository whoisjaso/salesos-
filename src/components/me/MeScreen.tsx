"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText, CaretRight, HandCoins, PlugsConnected } from "@phosphor-icons/react";
import { SEED_CONNECTED_COUNT } from "@/components/connect/connect-model";
import type { SopModule } from "@/content/sops";
import type { CoachingRecommendation } from "@/domain/types";
import { RulesCoachingEngine } from "@/domain/coaching";
import { cashRace, commissionSummary, recentCashDrops, tierFor } from "@/domain/cashTiers";
import { computeMetric } from "@/domain/metrics";
import { obaviaDataset, NOW } from "@/fixtures/obavia";
import { useSession } from "@/lib/session";
import { formatCount, formatMoneyMinor } from "@/lib/format";
import { OWNER_LABEL, type RecommendationUiState } from "@/lib/team-data";
import { Sheet } from "@/components/ui/Sheet";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Hero } from "@/components/home/Hero";
import { OneNumber } from "@/components/home/OneNumber";
import type { TodayData } from "@/components/home/today-model";
import { CashHero } from "@/components/cash/CashHero";
import { CashRace } from "@/components/cash/CashRace";
import { RecentDrops } from "@/components/cash/RecentDrops";
import { HeroCard } from "@/components/coach/HeroCard";
import { WhySheet } from "@/components/coach/WhySheet";
import { PlaybooksView } from "@/components/playbooks/PlaybooksView";

const dataset = obaviaDataset;

export interface MeScreenProps {
  data: TodayData;
  sops: SopModule[];
  boundaries: { canAdapt: string[]; neverAdapts: string[] };
}

export function MeScreen({ data, sops, boundaries }: MeScreenProps) {
  const router = useRouter();
  const { session, ready, clear } = useSession();

  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, session, router]);

  if (!ready || !session) return null;

  const signOut = () => {
    clear();
    router.replace("/");
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 sm:gap-4">
      {session.role === "owner" ? <OwnerMe /> : <RepMe key={session.userId} userId={session.userId} role={session.role} data={data} />}
      <PlaybookRow sops={sops} boundaries={boundaries} />
      {session.role === "owner" ? (
        <>
          <Link href="/connect" className="surface flex h-14 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-hover motion-reduce:transition-none">
            <PlugsConnected size={20} weight="regular" aria-hidden className="shrink-0 text-accent" />
            <span className="flex-1 text-[15px] font-medium text-fg">Connect</span>
            <span className="tabular text-[13px] text-fg-subtle">{SEED_CONNECTED_COUNT} connected</span>
            <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
          </Link>
          <Surface padding="none" className="flex h-14 items-center justify-between px-4">
            <span className="text-[15px] font-medium text-fg">Theme</span>
            <ThemeToggle />
          </Surface>
        </>
      ) : null}
      <button type="button" onClick={signOut} className="mx-auto mt-2 inline-flex h-10 items-center rounded-sm px-4 text-[14px] font-medium text-fg-muted hover:bg-hover hover:text-fg">
        Not you?
      </button>
    </div>
  );
}

function RepMe({ userId, role, data }: { userId: string; role: "setter" | "closer"; data: TodayData }) {
  const model = data.personas.find((p) => p.userId === userId);
  const [state, setState] = useState<RecommendationUiState>("proposed");
  const rec = useMemo(() => {
    const recs = RulesCoachingEngine.recommend(dataset, userId, NOW);
    return recs.find((r) => r.ownerRole === "rep" && !r.suppressed) ?? recs.find((r) => r.ownerRole === "rep") ?? recs[0];
  }, [userId]);
  const metric = useMemo(() => (rec ? computeMetric(rec.metricIds[0], dataset, { userId }, NOW) : null), [rec, userId]);
  const m19 = useMemo(() => computeMetric("M19", dataset, { userId, role }, NOW), [userId, role]);
  const currency = m19.currency ?? "USD";
  const season = useMemo(() => ({ from: data.season.from, to: data.season.to }), [data.season.from, data.season.to]);
  const summary = useMemo(() => commissionSummary(dataset, userId, season, NOW), [userId, season]);
  const race = useMemo(() => cashRace(dataset, season), [season]);
  const drops = useMemo(() => {
    const contacts = new Map(dataset.contacts.map((c) => [c.contactId, c]));
    const opps = new Map(dataset.opportunities.map((o) => [o.opportunityId, o]));
    return recentCashDrops(dataset, userId, season).map((d) => ({
      ...d,
      organizationName: contacts.get(opps.get(d.opportunityId)?.primaryContactId ?? "")?.organizationName,
    }));
  }, [userId, season]);
  const seasonName = data.season.label.replace(/ season$/, "");

  return (
    <>
      <CashHero summary={summary} />
      {model ? <Hero model={model} /> : null}
      <CashRace entries={race} meId={userId} seasonName={seasonName} currency={summary.currency} />
      <RecentDrops drops={drops} tier={tierFor(summary.totalMinor)} now={NOW} currency={summary.currency} />
      {model ? <OneNumber model={model} seasonLabel={data.season.label} /> : null}
      {rec && metric ? <HeroCard rec={rec} metric={metric} state={state} onState={setState} /> : null}
      <Surface padding="md">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
            <HandCoins size={14} aria-hidden />
            Per attended appointment
          </h3>
          {dataset.commissionPolicy.hypothetical ? (
            <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] text-fg-muted">Hypothetical policy</span>
          ) : null}
        </div>
        <div className="tabular mt-2 text-[28px] font-semibold leading-none text-fg">{m19.value === null ? "N/A" : formatMoneyMinor(Math.round(m19.value), currency, { cents: true })}</div>
        <div className="tabular mt-1.5 text-[12px] text-fg-subtle">
          {formatMoneyMinor(m19.numerator, currency)} over {formatCount(m19.denominator)} attended
        </div>
      </Surface>
    </>
  );
}

function OwnerMe() {
  const recs = useMemo(() => RulesCoachingEngine.recommend(dataset, null, NOW).filter((r) => r.ownerRole !== "rep"), []);
  const [open, setOpen] = useState<CoachingRecommendation | null>(null);

  if (recs.length === 0) return null;
  return (
    <>
      <Surface padding="none" as="section" aria-label="Recommendations">
        <ol className="divide-y divide-line">
          {recs.map((r) => (
            <li key={r.recommendationId}>
              <button type="button" onClick={() => setOpen(r)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium leading-snug text-fg">{r.title.replace(/^Resolve data before coaching: /, "")}</span>
                  <span className="block text-[12px] text-fg-subtle">{OWNER_LABEL[r.ownerRole]}</span>
                </span>
                <StateChip state={r.dataState} />
                <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
              </button>
            </li>
          ))}
        </ol>
      </Surface>
      {open ? <WhySheet open onClose={() => setOpen(null)} rec={open} /> : null}
    </>
  );
}

function PlaybookRow({ sops, boundaries }: { sops: SopModule[]; boundaries: MeScreenProps["boundaries"] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Surface padding="none" as="button" onClick={() => setOpen(true)} className="flex h-14 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-hover motion-reduce:transition-none">
        <BookOpenText size={20} weight="regular" aria-hidden className="shrink-0 text-accent" />
        <span className="flex-1 text-[15px] font-medium text-fg">Playbook</span>
        <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </Surface>
      <Sheet open={open} onClose={() => setOpen(false)} title="Playbook" width={760}>
        <PlaybooksView sops={sops} boundaries={boundaries} />
      </Sheet>
    </>
  );
}
