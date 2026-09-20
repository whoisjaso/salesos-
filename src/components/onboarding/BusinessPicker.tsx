"use client";

import { Buildings, CaretRight } from "@phosphor-icons/react";
import type { Identity } from "@/domain/onboarding";
import type { Tenant } from "@/domain/types";
import { sessionFor, useOnboarding } from "@/lib/onboarding";
import { ROLE_WORD } from "@/lib/session";

export interface BusinessPickerProps {
  identity: Identity;
  businesses: Tenant[];
  onPick: (tenantId: string) => void;
}

/** One person, several businesses. Sessions are per business. */
export function BusinessPicker({ identity, businesses, onPick }: BusinessPickerProps) {
  const { state } = useOnboarding();
  return (
    <ul className="flex flex-col gap-2" aria-label="Your businesses">
      {businesses.map((t) => {
        const s = sessionFor(state, identity, t.tenantId);
        return (
          <li key={t.tenantId}>
            <button
              type="button"
              onClick={() => onPick(t.tenantId)}
              className="surface flex h-[68px] w-full items-center gap-4 px-4 text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99] motion-reduce:transition-none"
            >
              <span className="inline-grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-sunken text-fg" aria-hidden>
                <Buildings size={22} weight="bold" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-medium leading-tight text-fg">{t.name}</span>
                <span className="block text-[13px] text-fg-muted">{s ? ROLE_WORD[s.role] : "No access"}</span>
              </span>
              <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
