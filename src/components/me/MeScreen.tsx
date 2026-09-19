"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText, CaretRight, GraduationCap, PauseCircle, PlugsConnected, SignOut, Trophy, UsersThree } from "@phosphor-icons/react";
import type { SopModule } from "@/content/sops";
import type { CoachingRecommendation } from "@/domain/types";
import { RulesCoachingEngine } from "@/domain/coaching";
import { cashRace, commissionPolicyFor, commissionSummary, recentCashDrops, tierFor, tierPolicyFor } from "@/domain/cashTiers";
import { qualityGate } from "@/domain/game";
import { computeMetric } from "@/domain/metrics";
import { obaviaCommissionPolicies, obaviaDataset, obaviaDatasetWithPairs, obaviaPairs, NOW } from "@/fixtures/obavia";
import { useSession } from "@/lib/session";
import { useTenantData } from "@/lib/onboarding";
import { CoachEmpty, MeEmpty } from "@/components/onboarding/MeEmpty";
import { formatCount } from "@/lib/format";
import { buildPairView, OWNER_LABEL, pairForRep, type PairView, type RecommendationUiState } from "@/lib/team-data";
import { DEFAULT_LEADERBOARD_POLICY } from "@/domain/leaderboard";
import { PairSheet } from "@/components/pairs/PairSheet";
import { PartnerCard } from "@/components/pairs/PartnerCard";
import { EditProfileButton, ProfileRow } from "@/components/profile";
import { Avatar } from "@/components/ui/Avatar";
import { DetailsRow } from "@/components/ui/DetailsRow";
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

/** Hypothetical per-role rates for the pair sheet's commission lines (D06). */
const PAIR_RATES = {
  setter: commissionPolicyFor(obaviaCommissionPolicies, "setter")?.ratePercent,
  closer: commissionPolicyFor(obaviaCommissionPolicies, "closer")?.ratePercent,
};

export interface MeScreenProps {
  data: TodayData;
  sops: SopModule[];
  boundaries: { canAdapt: string[]; neverAdapts: string[] };
}

/**
 * Me: the identity row, the money hero, one group of rows, and the sign-out line.
 * Everything else (level and streak, partner and pair bar, race, coaching, playbook,
 * profile edit) lives behind its row's sheet.
 */
export function MeScreen({ data, sops, boundaries }: MeScreenProps) {
  const router = useRouter();
  const { session, ready, clear } = useSession();
  const tenantData = useTenantData();

  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, session, router]);

  if (!ready || !session) return null;

  const signOut = () => {
    clear();
    router.replace("/");
  };

  const shared = (
    <>
      <PlaybookRow sops={sops} boundaries={boundaries} />
      {session.role === "owner" ? (
        <>
          <Link href="/connect" className="flex h-12 w-full items-center gap-3 px-4 text-left hover:bg-hover active:bg-hover">
            <PlugsConnected size={18} weight="regular" aria-hidden className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate text-[15px] text-fg">Connect</span>
            <span className="tabular shrink-0 text-[15px] text-fg-muted">{tenantData.counts.sources} connected</span>
            <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
          </Link>
          <div className="flex h-12 items-center justify-between px-4">
            <span className="text-[15px] text-fg">Theme</span>
            <ThemeToggle />
          </div>
        </>
      ) : null}
      <EditProfileButton />
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 sm:gap-4">
      <ProfileRow />
      {session.role === "owner" ? (
        <>
          {tenantData.demo ? null : <CoachEmpty data={tenantData} />}
          <Rows>
            {tenantData.demo ? <OwnerCoachRow /> : null}
            {shared}
          </Rows>
        </>
      ) : tenantData.demo ? (
        <RepMe key={session.userId} userId={session.userId} role={session.role} data={data}>
          {shared}
        </RepMe>
      ) : (
        <>
          <MeEmpty key={session.userId} data={tenantData} userId={session.userId} role={session.role} />
          <Rows>{shared}</Rows>
        </>
      )}
      <button
        type="button"
        onClick={signOut}
        className="flex h-12 w-full items-center gap-3 rounded-sm px-4 text-left text-[13px] font-medium text-fg-subtle transition-colors hover:bg-hover hover:text-fg motion-reduce:transition-none"
      >
        <SignOut size={16} weight="regular" aria-hidden className="shrink-0" />
        <span className="flex-1">Not you?</span>
        <span className="truncate text-[12px] font-normal text-fg-faint">{session.displayName}</span>
      </button>
    </div>
  );
}

/** The one group of rows. Rows are separated by a hairline, never bordered on their own. */
function Rows({ children }: { children: ReactNode }) {
  return (
    <Surface padding="none" as="section" aria-label="Details" className="overflow-hidden">
      <div className="divide-y divide-line">{children}</div>
    </Surface>
  );
}

type RepSheet = "level" | "partner" | "race" | "coach" | null;

function RepMe({ userId, role, data, children }: { userId: string; role: "setter" | "closer"; data: TodayData; children: ReactNode }) {
  const model = data.personas.find((p) => p.userId === userId);
  const [state, setState] = useState<RecommendationUiState>("proposed");
  const [sheet, setSheet] = useState<RepSheet>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const close = () => setSheet(null);

  const rec = useMemo(() => {
    const recs = RulesCoachingEngine.recommend(dataset, userId, NOW);
    return recs.find((r) => r.ownerRole === "rep" && !r.suppressed) ?? recs.find((r) => r.ownerRole === "rep") ?? recs[0];
  }, [userId]);
  const metric = useMemo(() => (rec ? computeMetric(rec.metricIds[0], dataset, { userId }, NOW) : null), [rec, userId]);
  const season = useMemo(() => ({ from: data.season.from, to: data.season.to }), [data.season.from, data.season.to]);
  // Role-correct money: the rep's own tier bracket, race, and commission rate all follow the session role.
  const tierPolicy = useMemo(() => tierPolicyFor(role), [role]);
  const summary = useMemo(() => commissionSummary(dataset, userId, season, NOW, obaviaCommissionPolicies), [userId, season]);
  const race = useMemo(() => cashRace(dataset, season, role, tierPolicy), [season, role, tierPolicy]);
  const gate = useMemo(() => qualityGate(dataset, userId), [userId]);
  const pairView = useMemo<PairView | null>(() => {
    const pair = pairForRep(obaviaDatasetWithPairs, obaviaPairs, userId, NOW);
    return pair ? buildPairView(obaviaDatasetWithPairs, obaviaPairs, pair, season, NOW, { minMaturedSample: DEFAULT_LEADERBOARD_POLICY.minMaturedSample, policies: obaviaCommissionPolicies }) : null;
  }, [userId, season]);
  const drops = useMemo(() => {
    const contacts = new Map(dataset.contacts.map((c) => [c.contactId, c]));
    const opps = new Map(dataset.opportunities.map((o) => [o.opportunityId, o]));
    return recentCashDrops(dataset, userId, season).map((d) => ({
      ...d,
      organizationName: contacts.get(opps.get(d.opportunityId)?.primaryContactId ?? "")?.organizationName,
    }));
  }, [userId, season]);
  const seasonName = data.season.label.replace(/ season$/, "");

  const partnerId = pairView ? (userId === pairView.pair.setterUserId ? pairView.pair.closerUserId : pairView.pair.setterUserId) : null;
  const partnerName = pairView ? (userId === pairView.pair.setterUserId ? pairView.closerDisplayName : pairView.setterDisplayName) : null;
  const mine = race.find((e) => e.userId === userId && e.role === role);

  return (
    <>
      <CashHero
        summary={summary}
        policy={tierPolicy}
        details={
          <>
            {model ? <OneNumber model={model} seasonLabel={data.season.label} /> : null}
            <RecentDrops drops={drops} tier={tierFor(summary.totalMinor, tierPolicy)} now={NOW} currency={summary.currency} />
          </>
        }
      />

      <Rows>
        {model ? (
          <DetailsRow
            label="Level"
            leading={<Avatar userId={userId} size={32} ring={model.track.progress} ringLabel={`${Math.round(model.track.progress * 100)}% to next level`} />}
            value={
              model.xpPaused ? (
                <span className="inline-flex items-center gap-1 text-perf-attention">
                  <PauseCircle size={15} weight="bold" aria-hidden />
                  Paused
                </span>
              ) : (
                formatCount(model.track.level)
              )
            }
            onClick={() => setSheet("level")}
          />
        ) : null}
        <DetailsRow
          label="Partner"
          leading={partnerId ? <Avatar userId={partnerId} size={32} /> : <UsersThree size={18} weight="regular" aria-hidden className="text-fg-subtle" />}
          value={partnerName ? partnerName.split(" ")[0] : "No pair yet"}
          onClick={() => setSheet("partner")}
        />
        <DetailsRow
          label="Race"
          leading={<Trophy size={18} weight="regular" aria-hidden className="text-fg-subtle" />}
          value={mine ? `#${mine.rank}` : "N/A"}
          onClick={() => setSheet("race")}
        />
        {rec && metric ? (
          <DetailsRow
            label="Coach"
            leading={<GraduationCap size={18} weight="regular" aria-hidden className="text-fg-subtle" />}
            value={<span className="block max-w-[180px] truncate">{rec.suppressed ? "Fix the data first" : rec.title}</span>}
            onClick={() => setSheet("coach")}
          />
        ) : null}
        {children}
      </Rows>

      {model ? (
        <Sheet open={sheet === "level"} onClose={close} title="Level" description={seasonName}>
          <div className="flex flex-col gap-3">
            <Hero model={model} />
            {model.xpPaused ? (
              <Surface padding="md" state="attention" className="flex flex-col gap-2">
                <StateChip state="attention" label="XP paused" className="self-start" />
                <p className="text-[13px] text-fg-muted">XP pauses while these are under review. It resumes on its own once they are settled.</p>
                <ul className="flex flex-col gap-1 text-[13px] text-fg">
                  {gate.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Surface>
            ) : null}
          </div>
        </Sheet>
      ) : null}

      <Sheet open={sheet === "partner"} onClose={close} title="Partner" description={partnerName ? `Runs with ${partnerName}` : "No pair yet"}>
        <PartnerCard
          view={pairView}
          meId={userId}
          onOpen={() => {
            close();
            setPairOpen(true);
          }}
        />
      </Sheet>

      <Sheet open={sheet === "race"} onClose={close} title="Race" description={`${seasonName}, net collected cash`}>
        <CashRace entries={race} meId={userId} seasonName={seasonName} currency={summary.currency} />
      </Sheet>

      {rec && metric ? (
        <Sheet open={sheet === "coach"} onClose={close} title="Coach" description={OWNER_LABEL[rec.ownerRole]}>
          <HeroCard rec={rec} metric={metric} state={state} onState={setState} />
        </Sheet>
      ) : null}

      <PairSheet open={pairOpen} onClose={() => setPairOpen(false)} view={pairView} viewer={{ role, userId }} rates={PAIR_RATES} />
    </>
  );
}

/** Owner: one Coach row with the count; the list and each Why live behind it. */
function OwnerCoachRow() {
  const recs = useMemo(() => RulesCoachingEngine.recommend(dataset, null, NOW).filter((r) => r.ownerRole !== "rep"), []);
  const [listOpen, setListOpen] = useState(false);
  const [open, setOpen] = useState<CoachingRecommendation | null>(null);

  if (recs.length === 0) return null;
  return (
    <>
      <DetailsRow
        label="Coach"
        leading={<GraduationCap size={18} weight="regular" aria-hidden className="text-fg-subtle" />}
        value={formatCount(recs.length)}
        onClick={() => setListOpen(true)}
      />
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Coach" description={`${formatCount(recs.length)} recommendations`}>
        <Surface padding="none" as="section" aria-label="Recommendations">
          <ol className="divide-y divide-line">
            {recs.map((r) => (
              <li key={r.recommendationId}>
                <button
                  type="button"
                  onClick={() => {
                    setListOpen(false);
                    setOpen(r);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium leading-snug text-fg">{r.title.replace(/^Resolve data before coaching: /, "")}</span>
                    <span className="block text-[12px] text-fg-subtle">{OWNER_LABEL[r.ownerRole]}</span>
                  </span>
                  <StateChip state={r.dataState} />
                  <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                </button>
              </li>
            ))}
          </ol>
        </Surface>
      </Sheet>
      {open ? <WhySheet open onClose={() => setOpen(null)} rec={open} /> : null}
    </>
  );
}

function PlaybookRow({ sops, boundaries }: { sops: SopModule[]; boundaries: MeScreenProps["boundaries"] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DetailsRow label="Playbook" leading={<BookOpenText size={18} weight="regular" aria-hidden className="text-fg-subtle" />} onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Playbook" width={760}>
        <PlaybooksView sops={sops} boundaries={boundaries} />
      </Sheet>
    </>
  );
}
