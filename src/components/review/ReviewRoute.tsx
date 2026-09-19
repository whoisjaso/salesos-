"use client";

import { useSearchParams } from "next/navigation";
import { ReviewScreen } from "./ReviewScreen";

/** Reads `?call=<id>` and hands it to the screen. Wrapped in Suspense by the page. */
export function ReviewRoute() {
  const params = useSearchParams();
  const callId = params.get("call") ?? undefined;
  return <ReviewScreen callId={callId} />;
}
