"use client";

import { useOnboarding } from "@/lib/onboarding";
import { CreateBusiness } from "./CreateBusiness";
import { IdentityPanel } from "./IdentityPanel";

/** /start: create a business, for deep links. Signs in first when there is no identity. */
export function StartScreen() {
  const { state, ready } = useOnboarding();
  if (!ready) return null;
  if (state.identity) return <CreateBusiness identity={state.identity} />;
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col pt-4 sm:pt-16">
      <div className="text-[12px] font-medium text-fg-subtle">Sales OS</div>
      <h1 className="mt-6 text-[32px] font-semibold leading-none tracking-tight text-fg">Create a business</h1>
      <div className="mt-8 flex flex-col gap-4">
        <div className="section-label">Sign in first</div>
        <IdentityPanel onIdentity={() => undefined} />
      </div>
    </div>
  );
}
