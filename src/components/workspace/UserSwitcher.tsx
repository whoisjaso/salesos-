"use client";

import { CaretDown, UserCircle } from "@phosphor-icons/react";
import type { User } from "@/domain/types";

export interface UserSwitcherProps {
  users: User[];
  value: string;
  onChange: (userId: string) => void;
}

/** Compact "viewing as" select. Demo control, not a permission change. */
export function UserSwitcher({ users, value, onChange }: UserSwitcherProps) {
  return (
    <label className="relative inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-raised pl-2 pr-7 text-[13px] text-fg">
      <UserCircle size={15} aria-hidden className="text-fg-subtle" />
      <span className="sr-only">Viewing as</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent pr-1 font-medium outline-none"
        aria-label="Viewing as"
      >
        {users.map((u) => (
          <option key={u.userId} value={u.userId}>
            {u.displayName.split(" ")[0]}
          </option>
        ))}
      </select>
      <CaretDown size={12} weight="bold" aria-hidden className="pointer-events-none absolute right-2 text-fg-subtle" />
    </label>
  );
}
