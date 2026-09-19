"use client";

import { useState } from "react";
import { UserPlus, UsersThree } from "@phosphor-icons/react";
import { emptyStateFor } from "@/domain/onboarding";
import type { TenantData } from "@/lib/onboarding";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { InviteSheet } from "./InviteSheet";
import { PendingInvites, RosterList } from "./Roster";

export interface InviteButtonProps {
  data: TenantData;
  /** The owner's user id. */
  by: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
}

/** The owner's Invite control plus its sheet. Sits in the Team header on any tenant. */
export function InviteButton({ data, by, size = "sm", variant = "secondary" }: InviteButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} leading={<UserPlus size={size === "sm" ? 14 : 16} weight="bold" />}>
        Invite
      </Button>
      <InviteSheet open={open} onClose={() => setOpen(false)} tenantId={data.tenantId} by={by} members={data.members} invites={data.invites} />
    </>
  );
}

export interface TeamRosterProps {
  data: TenantData;
  viewer: { userId: string; role: "setter" | "closer" | "owner" };
}

/**
 * Team for a business with no matured sample: the roster and, for the owner,
 * pending invites and the Invite action. No ranks (provisional by rule).
 */
export function TeamRoster({ data, viewer }: TeamRosterProps) {
  const owner = viewer.role === "owner";
  const empty = owner ? emptyStateFor("owner_team", data.counts) : emptyStateFor("team_board", data.counts);
  const by = owner ? viewer.userId : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-semibold leading-none tracking-tight text-fg">Team</h2>
        {owner ? <InviteButton data={data} by={viewer.userId} size="md" variant="primary" /> : null}
      </div>
      {empty.empty ? (
        <EmptyState icon={<UsersThree size={24} weight="bold" />} title={empty.title} evidence={owner ? `${empty.detail}. Invite by email, text, or a team code` : (empty.detail ?? "")} />
      ) : null}
      {owner ? <PendingInvites invites={data.invites} now={data.now} by={by} /> : null}
      <RosterList tenantId={data.tenantId} members={data.members} by={by} />
    </div>
  );
}
