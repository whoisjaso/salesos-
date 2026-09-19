"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isComplete } from "@/domain/profile";
import type { Identity } from "@/domain/onboarding";
import { EMPTY_STATE, sessionFor, tenantDisplayName, useOnboarding } from "@/lib/onboarding";
import { useProfiles } from "@/lib/profiles";
import { useSession } from "@/lib/session";
import { ProfileSetup } from "@/components/profile/ProfileSetup";
import { seedProfile } from "./bits";

export interface EnterBusinessProps {
  identity: Identity;
  tenantId: string;
  /** Where to land. Default is the role home. */
  to?: string;
}

/**
 * The last step of every way in: profile setup when it is not finished, then a
 * per-business session and the role home (docs/ONBOARDING.md, "Rep path" step 3 and 4).
 */
export function EnterBusiness({ identity, tenantId, to = "/" }: EnterBusinessProps) {
  const router = useRouter();
  const { state, ready } = useOnboarding();
  const profiles = useProfiles();
  const { setSession } = useSession();
  const [seeded, setSeeded] = useState(false);
  const memberships = state.memberships;
  const identityId = identity.identityId;
  // Stable per membership set, so the effects below run once, not on every render.
  const session = useMemo(() => (ready ? sessionFor({ ...EMPTY_STATE, memberships }, { ...identity, identityId }, tenantId) : null), [ready, memberships, identity, identityId, tenantId]);
  const profile = session ? profiles.get(session.userId) : undefined;
  const complete = isComplete(profile);

  useEffect(() => {
    if (!session || !profiles.ready) return;
    seedProfile(profiles, session.userId, session.displayName);
    setSeeded(true);
  }, [session, profiles]);

  useEffect(() => {
    if (!session || !seeded || !complete) return;
    setSession(session);
    router.replace(to);
  }, [session, seeded, complete, setSession, router, to]);

  if (!session || !seeded || complete) return null;
  return (
    <ProfileSetup
      userId={session.userId}
      tenantName={tenantDisplayName(state, tenantId)}
      onDone={() => {
        setSession(session);
        router.replace(to);
      }}
    />
  );
}
