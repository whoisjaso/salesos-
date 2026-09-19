"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useOnboarding } from "@/lib/onboarding";
import { JoinTeam } from "./JoinTeam";

/** /join?token=... or /join?code=...: accept an invite with the current identity. */
export function JoinScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, ready } = useOnboarding();
  const initial = params.get("token") ?? params.get("code") ?? "";
  if (!ready) return null;
  return <JoinTeam initial={initial} identity={state.identity} onBack={() => router.push("/")} />;
}
