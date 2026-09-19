"use client";

import { useState } from "react";
import { logoUrl, type IntegrationProvider } from "@/domain/integrations";
import { cn } from "@/lib/cn";
import { isNearBlack } from "./connect-model";

export interface LogoTileProps {
  p: IntegrationProvider;
  /** Tile edge in px. Default 44. */
  size?: number;
  className?: string;
}

/**
 * Brand mark on a brand-tinted tile. The Simple Icons SVG is a black
 * silhouette, so it is painted through a CSS mask in the brand color
 * (foreground color for near-black brands) and stays visible in dark mode.
 * The <img> carries alt text and detects a failed load; the fallback is the
 * first letter of the name in the same color.
 */
export function LogoTile({ p, size = 44, className }: LogoTileProps) {
  const [failed, setFailed] = useState(false);
  const url = logoUrl(p);
  const ink = isNearBlack(p.brandColor) ? "var(--fg)" : p.brandColor;
  const radius = size >= 64 ? Math.round(size * 0.28) : size >= 44 ? 12 : 10;
  const mark = Math.round(size * 0.5);

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
      {failed ? (
        <span aria-hidden className="font-semibold leading-none" style={{ color: ink, fontSize: Math.round(size * 0.42) }}>
          {p.name.charAt(0)}
        </span>
      ) : (
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
      )}
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
    </span>
  );
}
