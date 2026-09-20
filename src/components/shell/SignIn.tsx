"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Buildings, Hash, SignOut } from "@phosphor-icons/react";
import { isComplete } from "@/domain/profile";
import type { Identity } from "@/domain/onboarding";
import { ROLE_WORD, SESSION_PEOPLE, type SessionPerson, useSession } from "@/lib/session";
import { useProfiles } from "@/lib/profiles";
import { businessesFor, setIdentity, useOnboarding } from "@/lib/onboarding";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ProfileSetup } from "@/components/profile/ProfileSetup";
import { IdentityPanel } from "@/components/onboarding/IdentityPanel";
import { CreateBusiness } from "@/components/onboarding/CreateBusiness";
import { JoinTeam } from "@/components/onboarding/JoinTeam";
import { BusinessPicker } from "@/components/onboarding/BusinessPicker";
import { EnterBusiness } from "@/components/onboarding/EnterBusiness";

const ease = [0.16, 1, 0.3, 1] as const;

type Stage = "who" | "create" | "join" | "enter";

/**
 * Two paths on one screen. Top: identity, OAuth first (Google, work email link,
 * phone code). Bottom, quieter: join a team by code, and the demo team so
 * journeys and demos still work. After identity: create a business, join, or
 * pick one of yours; then profile setup if unfinished; then the role home.
 */
export function SignIn({ tenantName = "Obavia" }: { tenantName?: string }) {
  const { setSession } = useSession();
  const { get } = useProfiles();
  const { state, ready } = useOnboarding();
  const reduce = useReducedMotion();
  const [pending, setPending] = useState<SessionPerson | null>(null);
  const [stage, setStage] = useState<Stage>("who");
  const [enterTenant, setEnterTenant] = useState<string | null>(null);
  const identity = ready ? state.identity : null;
  const businesses = identity ? businessesFor(state, identity) : [];

  const enter = (p: SessionPerson) => setSession({ userId: p.userId, role: p.role, displayName: p.displayName });
  const pick = (p: SessionPerson) => {
    if (isComplete(get(p.userId))) enter(p);
    else setPending(p);
  };

  /** Fresh identity: one business goes straight in; none asks; several pick. */
  const onIdentity = (id: Identity) => {
    const mine = businessesFor(state, id);
    if (mine.length === 1) {
      setEnterTenant(mine[0].tenantId);
      setStage("enter");
    }
  };

  const forget = () => {
    setIdentity(null);
    setStage("who");
    setEnterTenant(null);
  };

  const fade = { initial: reduce ? false : { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: reduce ? undefined : { opacity: 0 }, transition: { duration: 0.3, ease } };

  if (stage === "enter" && identity && enterTenant) {
    return <EnterBusiness identity={identity} tenantId={enterTenant} />;
  }
  if (stage === "create" && identity) {
    return <CreateBusiness identity={identity} onCancel={() => setStage("who")} />;
  }
  if (stage === "join") {
    return <JoinTeam identity={identity} onBack={() => setStage("who")} />;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {pending ? (
        <motion.div key={`setup-${pending.userId}`} {...fade}>
          <ProfileSetup userId={pending.userId} tenantName={tenantName} onDone={() => enter(pending)} />
        </motion.div>
      ) : (
        <motion.div key="who" className="mx-auto flex w-full max-w-[440px] flex-col pt-4 sm:pt-16" exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.2, ease }}>
          <div className="text-[12px] font-medium text-fg-subtle">Sales OS</div>
          <h1 className="mt-6 text-[32px] font-semibold leading-none tracking-tight text-fg">Who are you</h1>

          <div className="mt-8">
            {identity ? (
              <div className="flex flex-col gap-3">
                <div className="surface flex items-center gap-3 px-4 py-3">
                  <Avatar name={identity.displayName ?? identity.subject} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-fg">{identity.displayName ?? identity.subject}</span>
                    <span className="block truncate text-[12px] text-fg-subtle">{identity.subject}</span>
                  </span>
                  <button type="button" onClick={forget} className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-[12px] font-medium text-fg-muted hover:bg-hover hover:text-fg" aria-label="Not you? Sign out">
                    <SignOut size={14} weight="bold" aria-hidden />
                    Not you?
                  </button>
                </div>
                {businesses.length > 0 ? (
                  <BusinessPicker
                    identity={identity}
                    businesses={businesses}
                    onPick={(tenantId) => {
                      setEnterTenant(tenantId);
                      setStage("enter");
                    }}
                  />
                ) : (
                  <p className="px-1 text-[13px] text-fg-muted">No business yet</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={businesses.length === 0 ? "primary" : "secondary"} size="lg" onClick={() => setStage("create")} leading={<Buildings size={16} weight="bold" />}>
                    Create a business
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => setStage("join")} leading={<Hash size={16} weight="bold" />}>
                    Enter a team code
                  </Button>
                </div>
              </div>
            ) : (
              <IdentityPanel onIdentity={onIdentity} />
            )}
          </div>

          <div className="mt-8 border-t border-line pt-5">
            {!identity ? (
              <button type="button" onClick={() => setStage("join")} className="mb-4 inline-flex h-9 items-center gap-2 rounded-sm px-2 text-[13px] font-medium text-fg-muted hover:bg-hover hover:text-fg">
                <Hash size={14} weight="bold" aria-hidden />
                Join a team
              </button>
            ) : null}
            <div className="section-label mb-2 px-1">Demo team</div>
            <ul className="flex flex-col gap-2" aria-label="Demo team">
              {SESSION_PEOPLE.map((p, i) => (
                <motion.li key={p.userId} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 + i * 0.04, ease }}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="surface flex h-[60px] w-full items-center gap-4 px-4 text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99] motion-reduce:transition-none"
                  >
                    <Avatar userId={p.userId} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium leading-tight text-fg">{p.displayName}</span>
                      <span className="block text-[12px] text-fg-muted">{ROLE_WORD[p.role]}</span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-[11px] text-fg-subtle">Synthetic fixture. Invented names and numbers</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
