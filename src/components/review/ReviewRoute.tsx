"use client";

import { useSearchParams } from "next/navigation";
import { ReviewScreen } from "./ReviewScreen";

/**
 * Reads `?call=<id>` and hands it to the screen. `?span=<startMs>` comes from an observation
 * shown on another surface (a cited word on the closer brief) and lands the reader on that
 * passage with the span highlighted. Wrapped in Suspense by the page.
 */
export function ReviewRoute() {
  const params = useSearchParams();
  const callId = params.get("call") ?? undefined;
  const raw = params.get("span");
  const span = raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
  return <ReviewScreen callId={callId} span={span} />;
}
