"use client";

import type { CSSProperties } from "react";
import type { Accent } from "@/domain/profile";
import { defaultAccent, initialsOf } from "@/domain/profile";
import type { CashTier } from "@/domain/cashTiers";
import { TierBadge } from "@/components/cash/TierBadge";
import { ACCENT_HEX, useProfiles } from "@/lib/profiles";
import { formatMoneyMinor } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * What the corner mark means, in words. A badge small enough to need memorizing carries
 * its meaning in text on tap ("Say the whole measurement", docs/DECISIONS.md), so nobody
 * has to learn a private alphabet of icons.
 */
function tierMeaning(tier: CashTier): string {
  return tier.minMinor > 0
    ? `${tier.label} tier: monthly net collected cash of ${formatMoneyMinor(tier.minMinor)} or more.`
    : `${tier.label} tier: the first tier, under the next threshold of monthly net collected cash.`;
}

export type AvatarSize = 24 | 32 | 40 | 48 | 64 | 96 | 128;

export interface AvatarProps {
  /** A person in the dataset: the photo and accent come from their profile. */
  userId?: string;
  /** Someone without a profile (a contact in the queue): initials on a neutral tint. */
  name?: string;
  size?: AvatarSize;
  /** Overrides the profile accent, for live previews. */
  accent?: Accent;
  /** Overrides the profile photo, for live previews. */
  photoUrl?: string | null;
  /** 0..1 level progress drawn as a ring in the accent. Omit for no ring. */
  ring?: number;
  /** Accessible label for the ring, e.g. "Level 3, 40% to next". */
  ringLabel?: string;
  /** Tier mark in the corner. Display only. */
  badge?: CashTier;
  /** When set, the avatar is a button that opens the person's card. */
  onOpenCard?: (userId: string) => void;
  className?: string;
}

const FONT: Record<AvatarSize, number> = { 24: 9, 32: 11, 40: 13, 48: 15, 64: 20, 96: 30, 128: 40 };
const STROKE: Record<AvatarSize, number> = { 24: 2, 32: 2, 40: 3, 48: 3, 64: 4, 96: 5, 128: 6 };
const BADGE: Record<AvatarSize, number> = { 24: 12, 32: 14, 40: 16, 48: 18, 64: 20, 96: 24, 128: 28 };

/**
 * A person's photo, or their initials on their accent tint. Optional level ring
 * and tier badge. Tapping opens the rep card when `onOpenCard` is given.
 */
export function Avatar({ userId, name, size = 40, accent, photoUrl, ring, ringLabel, badge, onOpenCard, className }: AvatarProps) {
  const { get } = useProfiles();
  const profile = userId ? get(userId) : undefined;
  const displayName = profile?.displayName ?? name ?? "";
  const hex = ACCENT_HEX[accent ?? profile?.accent ?? (userId ? defaultAccent(userId) : "slate")];
  const photo = photoUrl === undefined ? profile?.photo?.dataUrl : photoUrl ?? undefined;
  const initials = initialsOf(displayName) || "?";
  const hasRing = ring !== undefined;
  const stroke = STROKE[size];
  const inset = hasRing ? stroke + 2 : 0;
  const inner = size - inset * 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = hasRing ? Math.max(0, Math.min(1, ring)) : 0;
  const badgeMeaning = badge ? tierMeaning(badge) : undefined;
  const opensCard = Boolean(onOpenCard) && Boolean(userId);

  const style: CSSProperties = { width: size, height: size };
  const face = (
    <span
      aria-hidden
      className="absolute inline-grid place-items-center overflow-hidden rounded-full"
      style={{
        top: inset,
        left: inset,
        width: inner,
        height: inner,
        fontSize: FONT[size],
        backgroundColor: photo ? undefined : `color-mix(in srgb, ${hex} 18%, var(--bg-sunken))`,
        color: `color-mix(in srgb, ${hex} 60%, var(--fg))`,
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL from the profile store, no optimizer
        <img src={photo} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold leading-none tracking-tight">{initials}</span>
      )}
    </span>
  );

  const body = (
    <>
      {hasRing ? (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clamped * 100)}
          aria-label={ringLabel ?? `${Math.round(clamped * 100)}% to next level`}
          className="absolute inset-0 -rotate-90"
        >
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={hex}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - clamped)}
            className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-quart)] motion-reduce:transition-none"
          />
        </svg>
      ) : null}
      {face}
      {badge ? (
        <span
          role="img"
          aria-label={badgeMeaning}
          className="absolute -right-0.5 -bottom-0.5 inline-grid place-items-center rounded-[6px] ring-2 ring-raised"
        >
          {/* The badge inside a tappable avatar is not focusable a second time: the avatar's own
              name already states the tier, and its card states it again in full. */}
          <TierBadge tier={badge} size={BADGE[size]} tooltip={opensCard ? undefined : badgeMeaning} />
        </span>
      ) : null}
    </>
  );

  if (onOpenCard && userId) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenCard(userId);
        }}
        aria-label={[profile ? `@${profile.handle}` : "Person", badgeMeaning, "open card"].filter(Boolean).join(", ")}
        data-avatar={userId}
        className={cn("relative inline-block shrink-0 rounded-full transition-transform duration-150 hover:scale-[1.04] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:scale-100", className)}
        style={style}
      >
        {body}
      </button>
    );
  }
  return (
    <span className={cn("relative inline-block shrink-0 rounded-full", className)} style={style} data-avatar={userId}>
      {body}
    </span>
  );
}
