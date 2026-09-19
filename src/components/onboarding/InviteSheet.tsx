"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowsClockwise, Check, PaperPlaneTilt, QrCode } from "@phosphor-icons/react";
import { inviteState, TEAM_CODE_TTL_HOURS, type Invite, type InviteKind, type InviteRole } from "@/domain/onboarding";
import { clientNow, inviteLink, pendingTeamCode, regenerateTeamCode, sendInvite, useOnboarding, type Member } from "@/lib/onboarding";
import { ROLE_WORD } from "@/lib/session";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/team/Segmented";
import { CopyButton, INPUT, LABEL, origin, Refusal, SimulatedTag } from "./bits";
import { QrSvg } from "./QrSvg";
import { PendingInvites, RosterList } from "./Roster";

type Tab = "email" | "sms" | "team_code";
const TABS: { id: Tab; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "team_code", label: "Team code" },
];
const ROLES: InviteRole[] = ["setter", "closer"];

export interface InviteSheetProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  /** The owner's user id. */
  by: string;
  members: Member[];
  invites: Invite[];
}

function useTick(active: boolean, ms = 1000): string {
  const [now, setNow] = useState(clientNow);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(clientNow()), ms);
    return () => window.clearInterval(t);
  }, [active, ms]);
  return now;
}

function countdown(expiresAt: string, now: string): string {
  const ms = Math.max(0, Date.parse(expiresAt) - Date.parse(now));
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

/**
 * Invite by email, text, or team code. The owner sets the role and an optional
 * partner; a rep never picks their own role (docs/ONBOARDING.md, "Inviting reps").
 */
export function InviteSheet({ open, onClose, tenantId, by, members, invites }: InviteSheetProps) {
  const ids = { target: useId(), role: useId(), partner: useId() };
  const [tab, setTab] = useState<Tab>("email");
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<InviteRole>("setter");
  const [partner, setPartner] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invite | null>(null);
  const [showQr, setShowQr] = useState(false);
  const { state } = useOnboarding();
  const now = useTick(open);

  const partners = useMemo(() => {
    const opposite = role === "setter" ? "closer" : "setter";
    return members.filter((m) => m.membership.active && m.membership.role === opposite);
  }, [members, role]);

  // A partner picked for one role is not valid for the other; derive instead of resetting.
  const partnerValue = partners.some((p) => p.membership.userId === partner) ? partner : "";

  const code = pendingTeamCode(state, tenantId, now);
  const link = created ? inviteLink(created, origin()) : "";

  const send = () => {
    setError(null);
    try {
      const invite = sendInvite({ tenantId, kind: tab as InviteKind, target, role, pairWithUserId: partnerValue || undefined, createdBy: by });
      setCreated(invite);
      setTarget("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invite");
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setCreated(null);
  };

  const roleRadio = (
    <div>
      <div id={ids.role} className={LABEL}>
        Role
      </div>
      <div role="radiogroup" aria-labelledby={ids.role} className="grid grid-cols-2 gap-2">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            onClick={() => setRole(r)}
            className={cn("h-11 rounded-sm border px-3 text-left text-[14px] font-medium transition-colors motion-reduce:transition-none", role === r ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}
          >
            {ROLE_WORD[r]}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-fg-subtle">Set by you. A rep never picks their own role</p>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Invite" description="Email, text, or a code in the room" width={480}>
      <div className="flex flex-col gap-5">
        <Segmented options={TABS} value={tab} onChange={switchTab} label="Invite by" size="md" className="self-start" />

        {tab !== "team_code" ? (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div>
              <label htmlFor={ids.target} className={LABEL}>
                {tab === "email" ? "Work email" : "Phone"}
              </label>
              <input
                id={ids.target}
                type={tab === "email" ? "email" : "tel"}
                inputMode={tab === "email" ? "email" : "tel"}
                autoComplete="off"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={tab === "email" ? "rep@company.com" : "+15551234567"}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${ids.target}-err` : undefined}
                className={INPUT}
              />
              {error ? <Refusal id={`${ids.target}-err`}>{error}</Refusal> : <p className="mt-1.5 text-[12px] text-fg-subtle">{tab === "email" ? "They get a link, valid 7 days" : "They get a text with a link, valid 7 days. Country code required"}</p>}
            </div>
            {roleRadio}
            <div>
              <label htmlFor={ids.partner} className={LABEL}>
                Partner, optional
              </label>
              <select id={ids.partner} value={partnerValue} onChange={(e) => setPartner(e.target.value)} className={cn(INPUT, "appearance-none")} disabled={partners.length === 0}>
                <option value="">{partners.length === 0 ? `No active ${role === "setter" ? "closers" : "setters"} yet` : "None"}</option>
                {partners.map((p) => (
                  <option key={p.membership.userId} value={p.membership.userId}>
                    {p.user.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end">
              <Button type="submit" size="lg" disabled={!target.trim()} leading={<PaperPlaneTilt size={16} weight="bold" />} className="min-w-[112px]">
                Send
              </Button>
            </div>
            {created ? (
              <div className="surface flex flex-col gap-2 p-4" role="status">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-fg">
                    <Check size={14} weight="bold" aria-hidden className="text-perf-strong" />
                    Invite sent to {created.target}
                  </span>
                  <SimulatedTag />
                </div>
                <code className="tabular block truncate rounded-sm bg-sunken px-2 py-1.5 text-[12px] text-fg-muted" aria-label="Invite link">
                  {link}
                </code>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-fg-subtle">{ROLE_WORD[created.role]}, expires {formatRelativeTime(created.expiresAt, now)}</span>
                  <CopyButton text={link} label="Copy link" size="sm" />
                </div>
              </div>
            ) : null}
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {code ? (
              <div className="surface flex flex-col items-center gap-3 p-4 sm:p-5">
                <div className="tabular text-[44px] font-semibold leading-none tracking-[0.3em] text-fg" aria-label={`Team code ${code.token.split("").join(" ")}`}>
                  {code.token}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="chip text-fg">{ROLE_WORD[code.role]}</span>
                  <span className="chip border-dashed text-fg-muted" aria-live="off">
                    Expires in {countdown(code.expiresAt, now)}
                  </span>
                </div>
                {showQr ? <QrSvg text={inviteLink(code, origin())} label={`QR for team code ${code.token}`} size={200} className="mt-1 rounded-sm" /> : null}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="secondary" size="md" onClick={() => setShowQr((v) => !v)} leading={<QrCode size={16} weight="bold" />} aria-pressed={showQr}>
                    {showQr ? "Hide QR" : "Show QR"}
                  </Button>
                  <CopyButton text={code.token} label="Copy code" />
                  <Button variant="ghost" size="md" onClick={() => regenerateTeamCode(tenantId, role, by)} leading={<ArrowsClockwise size={16} weight="bold" />}>
                    Regenerate
                  </Button>
                </div>
                <p className="text-[12px] text-fg-subtle">Reps sign in, then enter the code. Valid {TEAM_CODE_TTL_HOURS} hours</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {roleRadio}
                <Button size="lg" onClick={() => regenerateTeamCode(tenantId, role, by)} leading={<QrCode size={16} weight="bold" />} className="self-end">
                  Make a code
                </Button>
              </div>
            )}
            {code ? (
              <div className="flex flex-col gap-2">
                <div className={LABEL}>Role for the next code</div>
                <div role="radiogroup" aria-label="Role for the next code" className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cn("h-10 rounded-sm border px-3 text-left text-[13px] font-medium", role === r ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}>
                      {ROLE_WORD[r]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <PendingInvites invites={invites} now={now} by={by} />

        <div>
          <div className="section-label mb-2 px-1">Members</div>
          <RosterList tenantId={tenantId} members={members} by={by} />
          <p className="mt-2 px-1 text-[11px] text-fg-subtle">
            Invites expire: email and text in 7 days, codes in {TEAM_CODE_TTL_HOURS} hours. Revoked and expired invites are {invites.filter((i) => inviteState(i, now) !== "pending" && inviteState(i, now) !== "accepted").length}
          </p>
        </div>
      </div>
    </Sheet>
  );
}
