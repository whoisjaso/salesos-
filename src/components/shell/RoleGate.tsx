"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

/**
 * Legacy route: sends the person to the right place for their role and renders nothing.
 * Signed out goes to "/", which is the sign-in screen. Pages stay static.
 */
export function RoleGate({ to }: { to: string }) {
  const router = useRouter();
  const { session, ready } = useSession();

  useEffect(() => {
    if (!ready) return;
    router.replace(session ? to : "/");
  }, [ready, session, to, router]);

  return null;
}
