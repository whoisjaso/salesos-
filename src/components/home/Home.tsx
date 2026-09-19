"use client";

import type { OwnerView } from "@/lib/owner-model";
import { useSession } from "@/lib/session";
import { SignIn } from "@/components/shell/SignIn";
import { OwnerDashboard } from "@/components/owner/OwnerDashboard";
import { SetterWorkspace } from "@/components/workspace/SetterWorkspace";
import { CloserWorkspace } from "@/components/workspace/CloserWorkspace";

/** Picks the home screen for the session role. */
export function Home({ ownerView }: { ownerView: OwnerView }) {
  const { session, ready } = useSession();
  if (!ready) return null;
  if (!session) return <SignIn />;
  if (session.role === "owner") return <OwnerDashboard view={ownerView} />;
  if (session.role === "closer") return <CloserWorkspace key={session.userId} userId={session.userId} />;
  return <SetterWorkspace key={session.userId} userId={session.userId} />;
}
