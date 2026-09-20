"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText, CaretRight, GraduationCap, PlugsConnected, SignOut, Trophy, UsersThree } from "@phosphor-icons/react";
import type { SopModule } from "@/content/sops";
import type { CoachingRecommendation } from "@/domain/types";
import { RulesCoachingEngine, coachingPlan } from "@/domain/coaching";
import { cashRace, commissionPolicyFor, commissionSummary, recentCashDrops, tierFor, tierPolicyFor, type ProvisionalNotice } from "@/domain/cashTiers";
import { qualityGate, type GameTrack } from "@/domain/game";
import { computeMetric } from "@/domain/metrics";
import { obaviaCommissionPolicies, obaviaDataset, obaviaDatasetWithPairs, obaviaPairs, NOW } from "@/fixtures/obavia";
import { transcripts } from "@/fixtures/calls";
import { useSession } from "@/lib/session";
import { useTenantData } from "@/lib/onboarding";
import { CoachEmpty, MeEmpty } from "@/components/onboarding/MeEmpty";
import { formatCount, formatMonthName } from "@/lib/format";
import { buildPairView, OWNER_LABEL, pairForRep, seasonPolicy, type PairView, type RecommendationUiState } from "@/lib/team-data";
import { DEFAULT_LEADERBOARD_POLICY, buildStandings, ownStanding } from "@/domain/leaderboard";
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
  /**
   * Set when a data incident makes the rep's money provisional. Passed straight
   * to the money hero, which says so in words with what it is waiting on. The
   * incident scope model in `src/domain/incidents.ts` is what fills this in;
   * until it is wired the default is null and nothing reads as held.
   */
  provisional?: ProvisionalNotice | null;
}

/**
 * Me: the identity row, the money hero, one group of rows, and the sign-out line.
 * Everything else (level and streak, partner and pair bar, race, coaching, playbook,
 * profile edit) lives behind its row's sheet.
 */
export function MeScreen({ data, sops, boundaries, provisional = null }: MeScreenProps) {
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
        <RepMe key={session.userId} userId={session.userId} role={session.role} data={data} provisional={provisional}>
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

/** XP tracks in the words a rep uses. A hold is always named by its track, never as "XP paused". */
const TRACK_LABEL: Record<GameTrack, string> = {
  commercial: "Commercial XP",
  mastery: "Practice XP",
  team: "Team XP",
};

function RepMe({
  userId,
  role,
  data,
  provisional,
  children,
}: {
  userId: string;
  role: "setter" | "closer";
  data: TodayData;
  provisional: ProvisionalNotice | null;
  children: ReactNode;
}) {
  const model = data.personas.find((p) => p.userId === userId);
  const [state, setState] = useState<RecommendationUiState>("proposed");
  const [sheet, setSheet] = useState<RepSheet>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const close = () => setSheet(null);

  /**
   * Coaching that stands comes first and is what the row shows. A hold never
   * replaces coaching with "fix the data": when nothing stands, the row names
   * the coaching that waits, what it waits on, and who owns that.
   *
   * The transcripts go in because every coached metric rests on attendance or
   * revenue attribution: without the rep's own conversations, one unlinked
   * payment leaves this row with nothing but a wait.
   */
  const plan = useMemo(() => coachingPlan(dataset, userId, NOW, { transcripts }), [userId]);
  const rec = useMemo(
    () => plan.standing.find((r) => r.ownerRole === "rep") ?? plan.standing[0] ?? plan.held.find((r) => r.ownerRole === "rep") ?? plan.held[0],
    [plan],
  );
  const recHold = rec?.held;
  /**
   * The incidents behind a held recommendation, named the way the row can carry
   * them: the first one in full, the rest counted. The whole list is one tap away.
   */
  const holdSummary = useMemo(() => {
    if (!recHold) return "";
    const ids = new Set(recHold.incidentIds);
    const titles = plan.scope.incidents.filter((i) => ids.has(i.incidentId)).map((i) => i.title);
    if (titles.length === 0) return recHold.waitingOn;
    return titles.length === 1 ? titles[0] : `${titles[0]} and ${formatCount(titles.length - 1)} more`;
  }, [recHold, plan]);
  /**
   * A recommendation read from a conversation carries no metric, and that is not a
   * gap: its evidence is the words it cites. Only a measured recommendation gets a
   * figure here.
   */
  const metric = useMemo(() => {
    const metricId = rec?.metricIds[0];
    return metricId ? computeMetric(metricId, dataset, { userId }, NOW) : null;
  }, [rec, userId]);
  const season = useMemo(() => ({ from: data.season.from, to: data.season.to }), [data.season.from, data.season.to]);
  // Role-correct money: the rep's own tier bracket, race, and commission rate all follow the session role.
  const tierPolicy = useMemo(() => tierPolicyFor(role), [role]);
  const summary = useMemo(() => commissionSummary(dataset, userId, season, NOW, obaviaCommissionPolicies), [userId, season]);
  const race = useMemo(() => cashRace(dataset, season, role, tierPolicy), [season, role, tierPolicy]);
  /**
   * The rep's own placing is read from the same standings the team board builds,
   * with the same policy, so a rank on Me can never contradict the board. When
   * the board produces a roster, no rank number is shown here either.
   */
  const standings = useMemo(() => buildStandings(dataset, "comparable_performance", seasonPolicy(NOW), NOW), []);
  const own = useMemo(() => ownStanding(standings, userId, role), [standings, userId, role]);
  // The board's own words, so the two screens can never read differently.
  const raceValue = own.rank !== null ? `#${own.rank}` : own.row ? "Roster" : "Not placed";
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
  const seasonName = formatMonthName(data.season.from);

  /**
   * The money hero says in words when a data incident makes commission
   * provisional. The caller can pass its own notice; otherwise the open
   * incidents that name the commission surface supply one, so the figure never
   * reads as settled when it is not. Nothing else on the screen is held.
   */
  const commissionNotice = useMemo<ProvisionalNotice | null>(() => {
    if (provisional) return provisional;
    const touching = gate.incidents.filter((i) => i.surfaces.includes("commission"));
    if (touching.length === 0) return null;
    return {
      statement: touching.map((i) => i.effect).join(" "),
      waitingOn: touching.map((i) => i.waitingOn).join(", and "),
      label: "Commission",
      ownerLabel: touching[0].ownerLabel,
      count: touching.length,
    };
  }, [provisional, gate]);

  /**
   * Whether this rep's payment feed was read, and what is holding it when it was
   * not. A verified zero and a missing figure are different facts: the zero is
   * only claimed when nothing makes collected-revenue attribution unreliable for
   * this rep (docs/DECISIONS.md, "Never show a list that looks ranked when
   * ranking is not established").
   */
  const cashFeed = useMemo<{ available: boolean; note?: string }>(() => {
    const holding = gate.incidents.filter((i) => i.surfaces.includes("revenue_attribution"));
    if (holding.length === 0) return { available: true };
    return {
      available: false,
      note: `${holding[0].effect} ${holding[0].waitingOn} before this list is complete, and ${holding[0].ownerLabel} owns that.`,
    };
  }, [gate]);

  const partnerId = pairView ? (userId === pairView.pair.setterUserId ? pairView.pair.closerUserId : pairView.pair.setterUserId) : null;
  const partnerName = pairView ? (userId === pairView.pair.setterUserId ? pairView.closerDisplayName : pairView.setterDisplayName) : null;

  return (
    <>
      <CashHero
        summary={summary}
        policy={tierPolicy}
        role={role}
        period={seasonName}
        provisional={commissionNotice}
        details={
          <>
            {model ? (
              <section aria-label="Net collected cash per assigned opportunity" className="flex flex-col gap-1.5">
                <p className="text-[12px] text-fg-subtle">Net collected cash per assigned opportunity, {seasonName}.</p>
                <OneNumber model={model} seasonLabel={data.season.label} />
              </section>
            ) : null}
            <RecentDrops
              drops={drops}
              tier={tierFor(summary.totalMinor, tierPolicy)}
              now={NOW}
              currency={summary.currency}
              period={seasonName}
              // The guard that separates an unread feed from a real zero, wired
              // to the only signal that actually knows: the incidents that make
              // collected-revenue attribution unreliable for this rep. Without
              // this, an empty feed announced itself as a verified zero
              // (docs/PAYMENTS_AUDIT.md H5).
              available={cashFeed.available}
              heldNote={cashFeed.note}
              synthetic={dataset.synthetic ?? false}
            />
          </>
        }
      />

      <Rows>
        {model ? (
          <DetailsRow
            label="Level"
            leading={<Avatar userId={userId} size={32} ring={model.track.progress} ringLabel={`${Math.round(model.track.progress * 100)}% to next level`} />}
            // The level is the rep's own verified progress and never reads as a global pause.
            // A track-specific hold is named, with its reason, inside the sheet.
            value={formatCount(model.track.level)}
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
          value={raceValue}
          ariaLabel={`Race. ${own.statement}`}
          onClick={() => setSheet("race")}
        />
        {rec ? (
          <DetailsRow
            label="Coach"
            leading={<GraduationCap size={18} weight="regular" aria-hidden className="text-fg-subtle" />}
            // Held coaching names what it waits on and who owns it. Standing coaching names
            // the thing itself, across the row so the words are never clipped.
            hint={recHold ? `Waiting on ${recHold.ownerLabel}: ${holdSummary}` : rec.title}
            ariaLabel={recHold ? `Coach. ${rec.title}. ${recHold.statement}` : `Coach. ${rec.title}`}
            onClick={() => setSheet("coach")}
          />
        ) : null}
        {children}
      </Rows>

      {model ? (
        <Sheet open={sheet === "level"} onClose={close} title="Level" description={`${seasonName}, your verified progress`}>
          <div className="flex flex-col gap-3">
            {/* The level, the ring and the streak are the rep's own verified progress. A hold is
                named by its track, with what it waits on, below; it never reads as a global pause. */}
            <Hero model={model} />
            {gate.holds.length > 0 ? (
              <Surface padding="md" state="attention" className="flex flex-col gap-2">
                <p className="text-[13px] text-fg">
                  Your level {formatCount(model.track.level)} and your streak are your own verified progress in {seasonName}. Nothing below changes them, and nothing below changes your pay.
                </p>
                {gate.holds.map((hold) => (
                  <div key={hold.track} className="flex flex-col gap-1.5">
                    <StateChip state="attention" label={`${TRACK_LABEL[hold.track]} partly on hold`} className="self-start" />
                    <p className="text-[13px] text-fg-muted">{hold.statement}</p>
                  </div>
                ))}
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

      <Sheet open={sheet === "race"} onClose={close} title="Race" description={`${seasonName}, your placing and the cash behind it`}>
        <div className="flex flex-col gap-3">
          {/* Read from the board's own rows: when the board shows a roster, so does this. */}
          <Surface padding="md" state={own.rank === null ? "attention" : undefined} className="flex flex-col gap-2">
            <StateChip
              state={own.rank === null ? "attention" : "strong"}
              label={own.rank !== null ? `Rank ${own.rank} of ${formatCount(own.of)}` : own.row ? "Roster, not a ranking" : "Not placed"}
              className="self-start"
            />
            <p className="text-[13px] text-fg">{own.statement}</p>
            {own.rank === null ? (
              <p className="text-[13px] text-fg-muted">
                The team board shows the same roster, so no ranking here can disagree with it. Your own figures and everything below keep running.
              </p>
            ) : null}
          </Surface>
          <CashRace entries={race} meId={userId} seasonName={seasonName} currency={summary.currency} />
        </div>
      </Sheet>

      {rec ? (
        <Sheet
          open={sheet === "coach"}
          onClose={close}
          title="Coach"
          // Where this came from, in the rep's terms: the conversation it was read from,
          // the wait it is under, or the function that owns it.
          description={recHold ? `Waiting on ${recHold.ownerLabel}` : rec.metricIds.length === 0 ? "Read from your own conversation" : OWNER_LABEL[rec.ownerRole]}
        >
          <div className="flex flex-col gap-3">
            {recHold ? (
              <Surface padding="md" state="attention" className="flex flex-col gap-2">
                <StateChip state="attention" label={`Waiting on ${recHold.ownerLabel}`} className="self-start" />
                <p className="text-[13px] text-fg">{recHold.statement}</p>
                <p className="text-[13px] text-fg-muted">
                  Nothing is asked of you here. Coaching that reads from your conversations is not held by this and appears as soon as it has evidence.
                </p>
              </Surface>
            ) : null}
            <HeroCard rec={rec} metric={metric} state={state} onState={setState} />
          </div>
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
