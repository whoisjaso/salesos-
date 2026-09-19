"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CaretRight, Flame } from "@phosphor-icons/react";
import { NOW, obaviaDataset, obaviaPairs } from "@/fixtures/obavia";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { ACCENT_HEX, useProfiles } from "@/lib/profiles";
import { useSession } from "@/lib/session";
import { formatCount, formatMoneyMinor } from "@/lib/format";
import { ProfileSetup } from "./ProfileSetup";
import { ROLE_WORD, buildRepCard, cardTier, levelProgress } from "./rep-card";

interface RepCardContextValue {
  openCard: (userId: string) => void;
  closeCard: () => void;
}

const RepCardContext = createContext<RepCardContextValue | null>(null);

/** Mounts one RepCardSheet for the whole app; any Avatar can open it through `useRepCard().openCard`. */
export function RepCardProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const openCard = useCallback((id: string) => setUserId(id), []);
  const closeCard = useCallback(() => setUserId(null), []);
  const value = useMemo(() => ({ openCard, closeCard }), [openCard, closeCard]);
  return (
    <RepCardContext.Provider value={value}>
      {children}
      <RepCardSheet userId={userId} onClose={closeCard} onOpen={openCard} />
    </RepCardContext.Provider>
  );
}

export function useRepCard(): RepCardContextValue {
  const ctx = useContext(RepCardContext);
  if (!ctx) throw new Error("useRepCard must be used inside RepCardProvider");
  return ctx;
}

export interface RepCardSheetProps {
  /** The person shown; null closes the sheet. */
  userId: string | null;
  onClose: () => void;
  /** Swap to another person's card (the partner row). */
  onOpen: (userId: string) => void;
}

/**
 * Player card, kept quiet: photo with level ring and tier badge, name, one line,
 * one number, one line of secondary numbers, the partner, edit. Nothing self-reported in the numbers.
 */
export function RepCardSheet({ userId, onClose, onOpen }: RepCardSheetProps) {
  const { get } = useProfiles();
  const { session } = useSession();
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState<string | null>(userId);
  const [prev, setPrev] = useState<string | null>(userId);

  // Keep the last person mounted while the sheet animates out; reset edit mode on every open or swap.
  if (userId !== prev) {
    setPrev(userId);
    setEditing(false);
    if (userId) setShown(userId);
  }

  const id = userId ?? shown;
  const profile = id ? get(id) : undefined;
  const card = useMemo(() => (id ? buildRepCard(obaviaDataset, obaviaPairs, id, NOW, profile) : null), [id, profile]);
  const level = useMemo(() => (id ? levelProgress(obaviaDataset, id, NOW) : null), [id]);
  const tier = card ? cardTier(card) : undefined;
  const mine = Boolean(session && id && session.userId === id);
  const hex = ACCENT_HEX[profile?.accent ?? "blue"];

  return (
    <Sheet open={userId !== null} onClose={onClose} title={editing ? "Edit profile" : "Card"} width={420}>
      {card && profile && id ? (
        editing ? (
          <ProfileSetup userId={id} mode="edit" onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
        ) : (
          <div className="-mx-4 -mt-3 sm:-mx-5 sm:-mt-4">
            <div
              className="flex flex-col items-center px-6 pt-10 pb-8 text-center"
              style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${hex} 18%, transparent) 0%, transparent 100%)` }}
            >
              <Avatar
                userId={id}
                size={128}
                ring={level?.progress ?? 0}
                ringLabel={`Level ${card.level}, ${Math.round((level?.progress ?? 0) * 100)}% to next`}
                badge={tier}
              />
              <h3 className="mt-5 text-[24px] font-semibold leading-none tracking-tight text-fg">{profile.displayName}</h3>
              <p className="mt-2 text-[13px] text-fg-muted">
                {ROLE_WORD[card.role]}
                <span aria-hidden className="mx-2 text-fg-faint">
                  &middot;
                </span>
                <span className="tabular">Level {card.level}</span>
                {card.streakDays > 0 ? (
                  <>
                    <span aria-hidden className="mx-2 text-fg-faint">
                      &middot;
                    </span>
                    <span className="inline-flex items-center gap-1 tabular">
                      <Flame size={12} weight="fill" aria-hidden className="text-[color:var(--perf-attention-fg)]" />
                      {formatCount(card.streakDays)}
                    </span>
                  </>
                ) : null}
              </p>
              {profile.howISell ? <p className="mt-5 max-w-[280px] text-[15px] leading-snug text-fg-muted">&ldquo;{profile.howISell}&rdquo;</p> : null}
            </div>

            <div className="px-6 pb-6 text-center">
              <div className="tabular text-[36px] font-semibold leading-none tracking-tight text-fg">
                {formatMoneyMinor(card.netCollectedMinor, card.currency)}
              </div>
              <p className="mt-2 text-[12px] text-fg-subtle">Net collected, {card.seasonLabel}</p>
              <p className="tabular mt-4 text-[14px] text-fg-muted">
                {formatCount(card.wins)} {card.wins === 1 ? "win" : "wins"}
                <span aria-hidden className="mx-2 text-fg-faint">
                  &middot;
                </span>
                {formatCount(card.attended)} {card.attended === 1 ? "show" : "shows"}
              </p>
            </div>

            {card.partner ? (
              <button
                type="button"
                onClick={() => onOpen(card.partner!.userId)}
                className="flex h-16 w-full items-center gap-3 border-t border-line px-6 text-left transition-colors hover:bg-hover motion-reduce:transition-none"
              >
                <Avatar userId={card.partner.userId} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium leading-tight text-fg">{card.partner.displayName}</span>
                  <span className="block text-[12px] text-fg-subtle">Runs with</span>
                </span>
                <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
              </button>
            ) : null}

            {mine ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex h-14 w-full items-center justify-center border-t border-line text-[14px] font-medium text-accent transition-colors hover:bg-hover motion-reduce:transition-none"
              >
                Edit profile
              </button>
            ) : null}
          </div>
        )
      ) : null}
    </Sheet>
  );
}
