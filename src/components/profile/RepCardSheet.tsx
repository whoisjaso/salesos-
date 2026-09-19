"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CaretRight, Flame, PencilSimple } from "@phosphor-icons/react";
import { NOW, obaviaDataset, obaviaPairs } from "@/fixtures/obavia";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TierBadge } from "@/components/cash/TierBadge";
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

/** Player card: photo with level ring and tier badge, handle, one line, four verified numbers, the pair. */
export function RepCardSheet({ userId, onClose, onOpen }: RepCardSheetProps) {
  const { get } = useProfiles();
  const { session } = useSession();
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState<string | null>(userId);

  // Keep the last person mounted while the sheet animates out.
  useEffect(() => {
    if (userId) setShown(userId);
    else setEditing(false);
  }, [userId]);

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
              className="flex flex-col items-center px-4 pt-7 pb-5 text-center"
              style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${hex} 22%, transparent) 0%, transparent 100%)` }}
            >
              <Avatar
                userId={id}
                size={96}
                ring={level?.progress ?? 0}
                ringLabel={`Level ${card.level}, ${Math.round((level?.progress ?? 0) * 100)}% to next`}
                badge={tier}
              />
              <h3 className="mt-4 text-[22px] font-semibold leading-none tracking-tight text-fg">{profile.displayName}</h3>
              <div className="mt-1.5 flex items-center gap-2 text-[13px] text-fg-muted">
                <span>@{profile.handle}</span>
                <span aria-hidden className="text-fg-faint">
                  &middot;
                </span>
                <span>{ROLE_WORD[card.role]}</span>
                <span aria-hidden className="text-fg-faint">
                  &middot;
                </span>
                <span className="tabular">Level {card.level}</span>
              </div>
              {profile.howISell ? <p className="mt-3 max-w-[300px] text-[15px] leading-snug text-fg">&ldquo;{profile.howISell}&rdquo;</p> : null}
            </div>

            <div className="px-4 pb-4 sm:px-5">
              <div className="flex items-center justify-between">
                <span className="section-label">{card.seasonLabel}</span>
                {tier ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted">
                    <TierBadge tier={tier} size={16} />
                    {tier.label}
                  </span>
                ) : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                <Stat label="Net collected" value={formatMoneyMinor(card.netCollectedMinor, card.currency)} />
                <Stat label="Wins" value={formatCount(card.wins)} />
                <Stat label="Shows" value={formatCount(card.attended)} />
                <Stat
                  label="Streak"
                  value={card.streakDays > 0 ? `${formatCount(card.streakDays)} ${card.streakDays === 1 ? "day" : "days"}` : "None"}
                  icon={card.streakDays > 0 ? <Flame size={14} weight="fill" aria-hidden className="text-[color:var(--perf-attention-fg)]" /> : undefined}
                />
              </dl>
              <p className="mt-2 text-[11px] text-fg-subtle">Verified from stage events and the ledger. Nothing self-reported.</p>

              {card.partner ? (
                <button
                  type="button"
                  onClick={() => onOpen(card.partner!.userId)}
                  className="surface mt-4 flex h-14 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none"
                >
                  <Avatar userId={card.partner.userId} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium leading-tight text-fg">Runs with {card.partner.displayName}</span>
                    <span className="block text-[12px] text-fg-subtle">{ROLE_WORD[card.partner.role]}</span>
                  </span>
                  <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                </button>
              ) : null}

              {mine ? (
                <Button variant="secondary" size="lg" leading={<PencilSimple size={16} weight="bold" />} onClick={() => setEditing(true)} className="mt-4 w-full">
                  Edit profile
                </Button>
              ) : null}
            </div>
          </div>
        )
      ) : null}
    </Sheet>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="surface flex flex-col gap-1 p-3">
      <dt className="text-[11px] font-medium text-fg-subtle">{label}</dt>
      <dd className="tabular flex items-center gap-1.5 text-[20px] font-semibold leading-none tracking-tight text-fg">
        {icon}
        {value}
      </dd>
    </div>
  );
}
