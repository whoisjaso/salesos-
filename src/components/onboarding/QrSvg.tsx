import { useMemo } from "react";
import { encodeQr, qrSvgPath } from "@/lib/qr";

export interface QrSvgProps {
  text: string;
  size?: number;
  label: string;
  className?: string;
}

/** A QR from src/lib/qr.ts, drawn as one path. Dark on light regardless of theme so any phone camera reads it. */
export function QrSvg({ text, size = 220, label, className }: QrSvgProps) {
  const drawn = useMemo(() => {
    const m = encodeQr(text);
    return m ? qrSvgPath(m) : null;
  }, [text]);
  if (!drawn) return null;
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={drawn.viewBox} shapeRendering="crispEdges" className={className}>
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={drawn.path} fill="#111111" />
    </svg>
  );
}
