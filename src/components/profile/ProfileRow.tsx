"use client";

import { useState } from "react";
import { CaretRight, PencilSimple } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/Avatar";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { useProfiles } from "@/lib/profiles";
import { useSession } from "@/lib/session";
import { ProfileSetup } from "./ProfileSetup";
import { useRepCard } from "./RepCardSheet";

export interface ProfileRowProps {
  /** Defaults to the session user. */
  userId?: string;
  className?: string;
}

/** Avatar, name, @handle, chevron. Tap opens the person's card. For MeScreen. */
export function ProfileRow({ userId, className }: ProfileRowProps) {
  const { session } = useSession();
  const { get } = useProfiles();
  const { openCard } = useRepCard();
  const id = userId ?? session?.userId;
  if (!id) return null;
  const profile = get(id);
  return (
    <button
      type="button"
      onClick={() => openCard(id)}
      className={`surface flex h-[72px] w-full items-center gap-4 px-4 text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.995] motion-reduce:transition-none ${className ?? ""}`}
    >
      <Avatar userId={id} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold leading-tight tracking-tight text-fg">{profile.displayName}</span>
        <span className="block truncate text-[13px] text-fg-muted">@{profile.handle}</span>
      </span>
      <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
    </button>
  );
}

/** Opens the session user's profile in edit mode inside a sheet. A DetailsRow: the caller groups it in a Surface. */
export function EditProfileButton({ className }: { className?: string }) {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  if (!session) return null;
  return (
    <>
      <DetailsRow
        label="Edit profile"
        leading={<PencilSimple size={18} weight="regular" aria-hidden className="text-fg-subtle" />}
        onClick={() => setOpen(true)}
        className={className}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title="Edit profile" width={420}>
        {open ? <ProfileSetup userId={session.userId} mode="edit" onDone={() => setOpen(false)} onCancel={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  );
}
