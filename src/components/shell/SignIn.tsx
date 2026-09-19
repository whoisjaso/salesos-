"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { isComplete } from "@/domain/profile";
import { ROLE_WORD, SESSION_PEOPLE, type SessionPerson, useSession } from "@/lib/session";
import { useProfiles } from "@/lib/profiles";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileSetup } from "@/components/profile/ProfileSetup";

const ease = [0.16, 1, 0.3, 1] as const;

/** "Who are you": one tappable row per person. First time in, the person builds their profile before landing. */
export function SignIn({ tenantName = "Obavia" }: { tenantName?: string }) {
  const { setSession } = useSession();
  const { get } = useProfiles();
  const reduce = useReducedMotion();
  const [pending, setPending] = useState<SessionPerson | null>(null);

  const enter = (p: SessionPerson) => setSession({ userId: p.userId, role: p.role, displayName: p.displayName });
  const pick = (p: SessionPerson) => {
    if (isComplete(get(p.userId))) enter(p);
    else setPending(p);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {pending ? (
        <motion.div key={`setup-${pending.userId}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.3, ease }}>
          <ProfileSetup userId={pending.userId} tenantName={tenantName} onDone={() => enter(pending)} />
        </motion.div>
      ) : (
        <motion.div key="who" className="mx-auto flex w-full max-w-[440px] flex-col pt-4 sm:pt-16" exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.2, ease }}>
          <div className="text-[12px] font-medium text-fg-subtle">{tenantName}</div>
          <h1 className="mt-6 text-[32px] font-semibold leading-none tracking-tight text-fg">Who are you</h1>
          <ul className="mt-8 flex flex-col gap-2">
            {SESSION_PEOPLE.map((p, i) => (
              <motion.li
                key={p.userId}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.05 + i * 0.04, ease }}
              >
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className="surface flex h-[68px] w-full items-center gap-4 px-4 text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99] motion-reduce:transition-none"
                >
                  <Avatar userId={p.userId} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-medium leading-tight text-fg">{p.displayName}</span>
                    <span className="block text-[13px] text-fg-muted">{ROLE_WORD[p.role]}</span>
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
