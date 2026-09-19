"use client";

import { motion, useReducedMotion } from "motion/react";
import { ROLE_WORD, SESSION_PEOPLE, useSession } from "@/lib/session";

const ease = [0.16, 1, 0.3, 1] as const;

/** "Who are you": one tappable row per person. */
export function SignIn({ tenantName = "Obavia" }: { tenantName?: string }) {
  const { setSession } = useSession();
  const reduce = useReducedMotion();

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col pt-4 sm:pt-16">
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
              onClick={() => setSession({ userId: p.userId, role: p.role, displayName: p.displayName })}
              className="surface flex h-[68px] w-full items-center gap-4 px-4 text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99] motion-reduce:transition-none"
            >
              <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent">{p.initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-medium leading-tight text-fg">{p.displayName}</span>
                <span className="block text-[13px] text-fg-muted">{ROLE_WORD[p.role]}</span>
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
