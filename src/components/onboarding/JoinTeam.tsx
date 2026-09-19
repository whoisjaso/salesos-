"use client";

import { useId, useMemo, useState } from "react";
import { ArrowLeft, UsersThree } from "@phosphor-icons/react";
import { inviteState, type AcceptRefusal, type Identity, type Invite } from "@/domain/onboarding";
import { accept, clientNow, findInvite, tenantById, useOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { INPUT, LABEL, Refusal } from "./bits";
import { EnterBusiness } from "./EnterBusiness";
import { IdentityPanel } from "./IdentityPanel";

const ROLE_WORD = { setter: "Setter", closer: "Closer" } as const;

export function refusalLine(reason: AcceptRefusal, invite?: Invite): string {
  switch (reason) {
    case "expired":
      return "That invite expired. Ask for a new one";
    case "revoked":
      return "That invite was revoked. Ask for a new one";
    case "already_accepted":
      return "That invite was already used";
    case "target_mismatch":
      return invite?.target ? `That invite is for ${invite.target}. Sign in with that ${invite.kind === "sms" ? "number" : "address"}` : "That invite is for someone else";
    case "already_member":
      return "You are already on this team";
  }
}

export interface JoinTeamProps {
  /** From a link: the hex token or the team code. */
  initial?: string;
  identity: Identity | null;
  onBack?: () => void;
}

/**
 * Rep path steps 1 and 2 (docs/ONBOARDING.md): tap the link or type the code,
 * sign in, accept. Refusals are one calm line. Success goes to profile setup, then Today.
 */
export function JoinTeam({ initial = "", identity, onBack }: JoinTeamProps) {
  const { state, ready } = useOnboarding();
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  const preview = useMemo(() => (ready ? findInvite(state, value) : undefined), [ready, state, value]);
  const previewTenant = preview ? tenantById(state, preview.tenantId) : undefined;
  const previewState = preview ? inviteState(preview, clientNow()) : undefined;
  const isLink = /^[0-9a-f]{32}$/.test(value.trim());

  const join = () => {
    if (!identity) return;
    setError(null);
    const invite = findInvite(state, value);
    if (!invite) {
      setError("No team matches that code. Check it with the owner");
      return;
    }
    const result = accept(invite, identity);
    if (!result.ok) {
      if (result.reason === "already_member") {
        setJoined(invite.tenantId);
        return;
      }
      setError(refusalLine(result.reason, invite));
      return;
    }
    setJoined(invite.tenantId);
  };

  if (joined && identity) return <EnterBusiness identity={identity} tenantId={joined} />;

  const intro =
    preview && previewTenant ? (
      <div className="surface mb-4 flex items-center gap-3 px-4 py-3">
        <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-fg" aria-hidden>
          <UsersThree size={18} weight="bold" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-fg">{previewTenant.name}</span>
          <span className="block text-[12px] text-fg-subtle">
            {ROLE_WORD[preview.role]}, {previewState === "pending" ? "invite open" : `invite ${previewState}`}
          </span>
        </span>
      </div>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col pt-4 sm:pt-16">
      <div className="text-[12px] font-medium text-fg-subtle">Sales OS</div>
      <h1 className="mt-6 text-[32px] font-semibold leading-none tracking-tight text-fg">Join a team</h1>
      <div className="mt-8 flex flex-col gap-4">
        {!identity ? (
          <>
            {intro}
            <div className="section-label">Sign in first</div>
            <IdentityPanel onIdentity={() => undefined} />
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            {intro}
            {!isLink || !preview ? (
              <div>
                <label htmlFor={id} className={LABEL}>
                  Team code
                </label>
                <input
                  id={id}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus={!initial}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="ABC123"
                  maxLength={64}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-err` : undefined}
                  className={cn(INPUT, value.length <= 8 && "tabular text-[22px] uppercase tracking-[0.25em]")}
                />
                {error ? <Refusal id={`${id}-err`}>{error}</Refusal> : <p className="mt-1.5 text-[12px] text-fg-subtle">Six characters from the owner, or a link</p>}
              </div>
            ) : error ? (
              <Refusal id={`${id}-err`}>{error}</Refusal>
            ) : null}
            <footer className="flex items-center gap-2">
              {onBack ? (
                <Button variant="ghost" size="lg" onClick={onBack} leading={<ArrowLeft size={16} weight="bold" />}>
                  Back
                </Button>
              ) : null}
              <span className="flex-1" />
              <Button type="submit" size="lg" disabled={value.trim().length < 6} className="min-w-[112px]">
                Join
              </Button>
            </footer>
            <p className="text-[12px] text-fg-subtle">
              Signed in as {identity.displayName ?? identity.subject}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
