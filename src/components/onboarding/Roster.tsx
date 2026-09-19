"use client";

import { useState } from "react";
import { ArrowsLeftRight, ClockCountdown, DotsThree, EnvelopeSimple, Hash, Prohibit, UserMinus, UserPlus } from "@phosphor-icons/react";
import { inviteState, type Invite } from "@/domain/onboarding";
import { changeMemberRole, revoke, setMemberActive, type Member } from "@/lib/onboarding";
import { ROLE_WORD } from "@/lib/session";
import { useProfiles } from "@/lib/profiles";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Surface } from "@/components/ui/Surface";

const ROLE_ORDER = { owner: 0, closer: 1, setter: 2, manager: 3, delivery: 4 } as const;

export interface RosterListProps {
  tenantId: string;
  members: Member[];
  /** The owner's user id when the viewer can change people. Reps get a read-only roster. */
  by?: string;
  className?: string;
}

/** Everyone on the team with role and active state. Removal keeps history. */
export function RosterList({ tenantId, members, by, className }: RosterListProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { list } = useProfiles();
  const known = new Set(list().map((p) => p.userId));
  const sorted = [...members].sort((a, b) => Number(b.membership.active) - Number(a.membership.active) || ROLE_ORDER[a.membership.role] - ROLE_ORDER[b.membership.role] || a.user.displayName.localeCompare(b.user.displayName));

  return (
    <Surface padding="none" as="section" aria-label="Roster" className={className}>
      <ul className="divide-y divide-line">
        {sorted.map((m) => {
          const { user, membership } = m;
          const rep = membership.role === "setter" || membership.role === "closer";
          const canEdit = Boolean(by) && rep && membership.userId !== by;
          const open = menuFor === membership.userId;
          const otherRole = membership.role === "setter" ? "closer" : "setter";
          return (
            <li key={membership.userId} className="flex flex-col">
              <div className={cn("flex items-center gap-3 px-4 py-3", !membership.active && "opacity-70")}>
                <Avatar userId={known.has(user.userId) ? user.userId : undefined} name={user.displayName} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-fg">{user.displayName}</span>
                  <span className="block truncate text-[12px] text-fg-subtle">
                    {ROLE_WORD[membership.role as keyof typeof ROLE_WORD] ?? membership.role}
                    {membership.active ? "" : ", removed"}
                    {membership.pairId ? ", paired" : ""}
                  </span>
                </span>
                <span className={cn("chip", membership.active ? "text-fg" : "border-dashed text-fg-subtle")}>
                  {membership.active ? "Active" : "Removed"}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setMenuFor(open ? null : membership.userId)}
                    aria-expanded={open}
                    aria-label={`Options, ${user.displayName}`}
                    className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg"
                  >
                    <DotsThree size={20} weight="bold" aria-hidden />
                  </button>
                ) : null}
              </div>
              {open && by ? (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      changeMemberRole(tenantId, membership.userId, otherRole, by);
                      setMenuFor(null);
                    }}
                    className="chip h-8 gap-1.5 text-fg hover:bg-hover"
                  >
                    <ArrowsLeftRight size={12} weight="bold" aria-hidden />
                    Change role to {ROLE_WORD[otherRole].toLowerCase()}
                  </button>
                  {membership.active ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMemberActive(tenantId, membership.userId, false, by);
                        setMenuFor(null);
                      }}
                      className="chip h-8 gap-1.5 border-[color:var(--perf-issue-line)] text-perf-issue hover:bg-hover"
                    >
                      <UserMinus size={12} weight="bold" aria-hidden />
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMemberActive(tenantId, membership.userId, true, by);
                        setMenuFor(null);
                      }}
                      className="chip h-8 gap-1.5 text-fg hover:bg-hover"
                    >
                      <UserPlus size={12} weight="bold" aria-hidden />
                      Restore
                    </button>
                  )}
                  <span className="text-[11px] text-fg-subtle">History stays with the person</span>
                </div>
              ) : null}
            </li>
          );
        })}
        {sorted.length === 0 ? <li className="px-4 py-6 text-center text-[13px] text-fg-subtle">No one yet</li> : null}
      </ul>
    </Surface>
  );
}

export interface PendingInvitesProps {
  invites: Invite[];
  now: string;
  /** The owner's user id, to revoke. */
  by?: string;
  className?: string;
}

const KIND_ICON = { email: EnvelopeSimple, sms: Hash, team_code: Hash } as const;

/** Open email and text invites. Team codes show on their own tab. */
export function PendingInvites({ invites, now, by, className }: PendingInvitesProps) {
  const pending = invites.filter((i) => i.kind !== "team_code" && inviteState(i, now) === "pending");
  if (pending.length === 0) return null;
  return (
    <Surface padding="none" as="section" aria-label="Pending invites" className={className}>
      <div className="section-label flex items-center gap-1.5 px-4 pt-3">
        <ClockCountdown size={11} weight="bold" aria-hidden />
        Pending
      </div>
      <ul className="divide-y divide-line">
        {pending.map((i) => {
          const Icon = KIND_ICON[i.kind];
          return (
            <li key={i.inviteId} className="flex items-center gap-3 px-4 py-3">
              <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-fg-subtle" aria-hidden>
                <Icon size={16} weight="bold" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-fg">{i.target}</span>
                <span className="block truncate text-[12px] text-fg-subtle">
                  {ROLE_WORD[i.role]}, expires {formatRelativeTime(i.expiresAt, now)}
                </span>
              </span>
              {by ? (
                <button type="button" onClick={() => revoke(i.inviteId, by)} className="chip h-8 gap-1.5 text-fg-muted hover:bg-hover hover:text-fg" aria-label={`Revoke invite for ${i.target}`}>
                  <Prohibit size={12} weight="bold" aria-hidden />
                  Revoke
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
