"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { obaviaDataset } from "@/fixtures/obavia";
import { initialsOf } from "@/lib/format";

export type SessionRole = "setter" | "closer" | "owner";

export interface Session {
  userId: string;
  role: SessionRole;
  displayName: string;
  /** Sessions are per business. Absent for the demo tenant's fixture people. */
  tenantId?: string;
}

export interface SessionPerson extends Session {
  initials: string;
}

export const SESSION_KEY = "sos-session";

const ROLE_ORDER: SessionRole[] = ["owner", "closer", "setter"];

function roleOf(roles: string[]): SessionRole | null {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? null;
}

/** Everyone who can sign in: owner first, then closers, then setters, as listed in the dataset. */
export const SESSION_PEOPLE: SessionPerson[] = obaviaDataset.users
  .filter((u) => u.active)
  .map((u) => ({ userId: u.userId, role: roleOf(u.roles), displayName: u.displayName, initials: initialsOf(u.displayName) }))
  .filter((p): p is SessionPerson => p.role !== null);

export const ROLE_WORD: Record<SessionRole, string> = { setter: "Setter", closer: "Closer", owner: "Owner" };

function readStored(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    const person = SESSION_PEOPLE.find((p) => p.userId === parsed.userId);
    if (person) return { userId: person.userId, role: person.role, displayName: person.displayName };
    // Someone who joined through onboarding: a per-business session (src/lib/onboarding.tsx).
    if (
      typeof parsed.tenantId === "string" &&
      typeof parsed.userId === "string" &&
      typeof parsed.displayName === "string" &&
      (parsed.role === "setter" || parsed.role === "closer" || parsed.role === "owner")
    ) {
      return { userId: parsed.userId, role: parsed.role, displayName: parsed.displayName, tenantId: parsed.tenantId };
    }
    return null;
  } catch {
    return null;
  }
}

const EVENT = "sos-session-change";
const LOADING = "loading" as const;
let cached: Session | null | undefined;

function writeStored(session: Session | null) {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable, the session still applies for this page */
  }
  if (session) document.documentElement.setAttribute("data-role", session.role);
  else document.documentElement.removeAttribute("data-role");
  cached = session;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SESSION_KEY) {
      cached = undefined;
      onChange();
    }
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Session | null {
  if (cached === undefined) cached = readStored();
  return cached;
}

function getServerSnapshot(): typeof LOADING {
  return LOADING;
}

interface SessionContextValue {
  session: Session | null;
  /** False until the stored session has been read on the client. */
  ready: boolean;
  setSession: (next: Session) => void;
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore<Session | null | typeof LOADING>(subscribe, getSnapshot, getServerSnapshot);
  const ready = snapshot !== LOADING;
  const session = ready ? snapshot : null;

  const setSession = useCallback((next: Session) => writeStored(next), []);
  const clear = useCallback(() => writeStored(null), []);

  const value = useMemo(() => ({ session, ready, setSession, clear }), [session, ready, setSession, clear]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
