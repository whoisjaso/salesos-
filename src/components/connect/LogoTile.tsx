"use client";

import { useState } from "react";
import { LinkSimple } from "@phosphor-icons/react";
import { logoMode, logoUrl, type IntegrationProvider } from "@/domain/integrations";
import { cn } from "@/lib/cn";
import { isNearBlack } from "./connect-model";

export interface LogoTileProps {
  p: IntegrationProvider;
  /** Tile edge in px. Default 44. */
  size?: number;
  className?: string;
}

/**
 * Brand mark on a brand-tinted tile.
 * mask: the Simple Icons silhouette painted in the brand color so it stays visible in dark mode.
 * image: a full-color official mark (favicon or color SVG) rendered as-is.
 * icon: not a brand, a generic Phosphor icon.
 * A failed load falls back to the first letter in the brand color.
 */
export function LogoTile({ p, size = 44, className }: LogoTileProps) {
  const [failed, setFailed] = useState(false);
  const url = logoUrl(p);
  const mode = logoMode(p);
  const ink = isNearBlack(p.brandColor) ? "var(--fg)" : p.brandColor;
  const radius = size >= 64 ? Math.round(size * 0.28) : size >= 44 ? 12 : 10;
  const mark = Math.round(size * (mode === "image" ? 0.58 : 0.5));

  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `color-mix(in srgb, ${ink} 14%, var(--bg-raised))`,
        boxShadow: "inset 0 0 0 1px var(--line)",
      }}
    >
      {mode === "icon" ? (
        <LinkSimple aria-hidden size={mark} weight="bold" color={ink} />
      ) : failed ? (
        <span aria-hidden className="font-semibold leading-none" style={{ color: ink, fontSize: Math.round(size * 0.42) }}>
          {p.name.charAt(0)}
        </span>
      ) : mode === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={p.name}
          width={mark}
          height={mark}
          decoding="async"
          onError={() => setFailed(true)}
          style={{ width: mark, height: mark, borderRadius: Math.round(mark * 0.22), objectFit: "contain" }}
        />
      ) : (
        <>
          <span
            aria-hidden
            style={{
              width: mark,
              height: mark,
              backgroundColor: ink,
              maskImage: `url("${url}")`,
              WebkitMaskImage: `url("${url}")`,
              maskSize: "contain",
              WebkitMaskSize: "contain",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={p.name}
            width={mark}
            height={mark}
            decoding="async"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full opacity-0"
          />
        </>
      )}
    </span>
  );
}
