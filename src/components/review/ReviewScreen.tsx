"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, PhoneSlash } from "@phosphor-icons/react";
import { obaviaDataset } from "@/fixtures/obavia";
import { useSession } from "@/lib/session";
import { buildReview, canReview, type Viewer } from "@/lib/review";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReviewCall } from "./ReviewCall";
import { ReviewList } from "./ReviewList";

/**
 * Gate and switch. Signed out goes to "/". A rep opens only their own calls; the owner
 * opens any. No call param lists the reviewable calls for the viewer.
 */
export function ReviewScreen({ callId }: { callId?: string }) {
  const router = useRouter();
  const { session, ready } = useSession();

  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, session, router]);

  const viewer: Viewer | null = useMemo(() => (session ? { userId: session.userId, role: session.role } : null), [session]);
  const review = useMemo(() => (callId ? buildReview(callId) : undefined), [callId]);

  if (!ready || !viewer) return null;

  if (!callId) return <ReviewList viewer={viewer} />;

  const call = obaviaDataset.calls.find((c) => c.callId === callId);
  if (call && !canReview(viewer, call)) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <EmptyState
          icon={<Lock size={28} aria-hidden />}
          title="Not yours"
          evidence="This call belongs to another rep. You can review calls you made; the owner can review every call."
          action={
            <Button variant="secondary" href="/review" leading={<ArrowLeft size={16} weight="bold" />}>
              Your calls
            </Button>
          }
        />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <EmptyState
          icon={<PhoneSlash size={28} aria-hidden />}
          title="No transcript"
          evidence="Review needs an ended call with a transcript from the business-owned dialer or a connected Zoom or Meet recording."
          action={
            <Button variant="secondary" href="/review" leading={<ArrowLeft size={16} weight="bold" />}>
              Calls
            </Button>
          }
        />
      </div>
    );
  }

  return <ReviewCall key={callId} review={review} viewer={viewer} />;
}
