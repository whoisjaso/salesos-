import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewRoute } from "@/components/review/ReviewRoute";

export const metadata: Metadata = { title: "Review" };

/**
 * Native call review. `/review` lists the viewer's reviewable calls; `/review?call=<id>`
 * opens one. The query string is read on the client, so the page stays static.
 */
export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewRoute />
    </Suspense>
  );
}
