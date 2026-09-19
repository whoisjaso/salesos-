"use client";

import type { ComponentType } from "react";
import { Bag, Coin, Diamond, Money, Stack, type IconProps } from "@phosphor-icons/react";
import type { CashTier, CashTierIcon, CashTierId } from "@/domain/cashTiers";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

export const TIER_ICON: Record<CashTierIcon, ComponentType<IconProps>> = {
  Coin,
  Money,
  Stack,
  Bag,
  Diamond,
};

/** The icon that falls in the drop animation. Coins and cash both rain coins; higher tiers rain their own mark. */
export const DROP_ICON: Record<CashTierId, ComponentType<IconProps>> = {
  coins: Coin,
  cash: Coin,
  stacks: Money,
  bags: Bag,
  diamonds: Diamond,
};

export interface TierBadgeProps {
  tier: CashTier;
  /** Tile size in px. */
  size?: number;
  /** Tooltip text; omitted means no tooltip, only an aria-label. */
  tooltip?: string;
  className?: string;
}

/** Tier mark: duotone icon in the tier hue on a tinted tile. Display only. */
export function TierBadge({ tier, size = 20, tooltip, className }: TierBadgeProps) {
  const Icon = TIER_ICON[tier.icon];
  const tile = (
    <span
      role="img"
      aria-label={`${tier.label} tier`}
      tabIndex={tooltip ? 0 : undefined}
      onClick={tooltip ? (e) => e.stopPropagation() : undefined}
      className={cn("inline-grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.22)),
        color: tier.hue,
        backgroundColor: `color-mix(in srgb, ${tier.hue} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tier.hue} 28%, transparent)`,
      }}
    >
      <Icon size={Math.round(size * 0.62)} weight="duotone" aria-hidden />
    </span>
  );
  return tooltip ? <Tooltip content={tooltip}>{tile}</Tooltip> : tile;
}
