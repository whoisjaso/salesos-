import { Suspense } from "react";
import type { Metadata } from "next";
import { JoinScreen } from "@/components/onboarding/JoinScreen";

export const metadata: Metadata = { title: "Join a team" };

/** Invite links and team codes land here. The query is read on the client. */
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinScreen />
    </Suspense>
  );
}
