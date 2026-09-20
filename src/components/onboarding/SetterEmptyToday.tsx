"use client";

import { useId, useState } from "react";
import { ChatText, Link as LinkIcon, Phone, Plus, UserPlus } from "@phosphor-icons/react";
import { emptyStateFor } from "@/domain/onboarding";
import { addLead, shareLinkFor, type ManualLead, type TenantData } from "@/lib/onboarding";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { CopyButton, INPUT, LABEL, origin, Refusal } from "./bits";

export interface SetterEmptyTodayProps {
  data: TenantData;
  userId: string;
}

/**
 * Today for a setter in a business with no leads: the share link and a way to
 * add a lead by hand. The first lead replaces this with a plain hero for it.
 */
export function SetterEmptyToday({ data, userId }: SetterEmptyTodayProps) {
  const [addOpen, setAddOpen] = useState(false);
  const empty = emptyStateFor("setter_today", data.counts);
  const link = shareLinkFor(data.tenantId, origin());
  const mine = data.leads.filter((l) => l.opportunity.currentOwner.setter === userId);
  const newest = mine[mine.length - 1];

  return (
    <>
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        {empty.empty || !newest ? (
          <Surface padding="md" as="section" aria-label={empty.title} className="flex flex-col">
            <div className="flex min-h-[148px] flex-col gap-3">
              <div>
                <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">{empty.title}</h2>
                <div className="mt-0.5 text-[12px] text-fg-subtle">{empty.detail}</div>
              </div>
              <div className="flex items-center gap-2 rounded-sm bg-sunken px-3 py-2">
                <LinkIcon size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                <code className="tabular min-w-0 flex-1 truncate text-[12px] text-fg-muted" aria-label="Share link">
                  {link}
                </code>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip border-dashed text-fg-muted">Organic, referrals, walk-ins</span>
                <span className="chip border-dashed text-fg-muted">Source: share link</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <CopyButton text={link} label="Copy link" variant="primary" size="lg" className="h-12 rounded-md text-[15px]" />
              <Button variant="secondary" size="lg" onClick={() => setAddOpen(true)} leading={<Plus size={16} weight="bold" />} className="h-12 rounded-md px-2 text-[14px] sm:text-[15px]">
                Add a lead by hand
              </Button>
            </div>
          </Surface>
        ) : (
          <FirstLeads leads={mine} newest={newest} now={data.now} onAdd={() => setAddOpen(true)} />
        )}
      </div>
      <AddLeadSheet open={addOpen} onClose={() => setAddOpen(false)} tenantId={data.tenantId} userId={userId} />
    </>
  );
}

function ConsentChip({ channel, granted }: { channel: string; granted: boolean }) {
  return (
    <span className={cn("chip", granted ? "text-fg" : "border-dashed text-fg-subtle")} aria-label={`${channel} ${granted ? "granted" : "unknown"}`}>
      {channel === "Phone" ? <Phone size={12} weight="bold" aria-hidden /> : <ChatText size={12} weight="bold" aria-hidden />}
      {granted ? channel : `${channel} unknown`}
    </span>
  );
}

function FirstLeads({ leads, newest, now, onAdd }: { leads: ManualLead[]; newest: ManualLead; now: string; onAdd: () => void }) {
  const others = leads.filter((l) => l !== newest).reverse();
  return (
    <>
      <Surface padding="md" as="section" aria-label="First lead" className="flex flex-col">
        <div className="flex min-h-[148px] flex-col gap-3">
          <div>
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">{newest.contact.displayName}</h2>
            <div className="mt-0.5 truncate text-[12px] text-fg-subtle">Added by hand, {formatRelativeTime(newest.submission.receivedAt, now)}</div>
          </div>
          {newest.submission.requestText ? <p className="text-[14px] italic leading-snug text-fg-muted">&ldquo;{newest.submission.requestText}&rdquo;</p> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <ConsentChip channel="Phone" granted={newest.contact.consent.phone === "granted"} />
            <ConsentChip channel="SMS" granted={newest.contact.consent.sms === "granted"} />
            <span className="chip border-dashed text-fg-muted">Assigned, no contact yet</span>
          </div>
        </div>
        <div className="mt-4 h-12">
          <Button size="lg" href={`tel:${newest.phone}`} leading={<Phone size={20} weight="bold" />} className="h-12 w-full rounded-md text-[17px]" data-testid="dock">
            Call
          </Button>
        </div>
      </Surface>
      <Surface padding="none" as="section" aria-label="Leads">
        <ul className="divide-y divide-line">
          {others.map((l) => (
            <li key={l.opportunity.opportunityId} className="flex items-center gap-3 px-4 py-3">
              <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-fg-subtle" aria-hidden>
                <UserPlus size={16} weight="bold" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-fg">{l.contact.displayName}</span>
                <span className="block truncate text-[12px] text-fg-subtle">Added by hand, {formatRelativeTime(l.submission.receivedAt, now)}</span>
              </span>
            </li>
          ))}
          <li>
            <button type="button" onClick={onAdd} className="flex h-12 w-full items-center gap-3 px-4 text-left text-[14px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg motion-reduce:transition-none">
              <Plus size={16} weight="bold" aria-hidden />
              Add a lead by hand
            </button>
          </li>
        </ul>
      </Surface>
    </>
  );
}

function AddLeadSheet({ open, onClose, tenantId, userId }: { open: boolean; onClose: () => void; tenantId: string; userId: string }) {
  const ids = { name: useId(), phone: useId(), note: useId(), consent: useId() };
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const result = addLead(tenantId, userId, { name, phone, note, phoneConsent: consent });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setName("");
    setPhone("");
    setNote("");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a lead"
      description="Name, number, what they said"
      footer={
        <Button size="lg" className="w-full" onClick={submit} disabled={!name.trim() || !phone.trim()} leading={<Plus size={16} weight="bold" />}>
          Add lead
        </Button>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor={ids.name} className={LABEL}>
            Name
          </label>
          <input id={ids.name} value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} className={INPUT} aria-invalid={error === "Name"} />
        </div>
        <div>
          <label htmlFor={ids.phone} className={LABEL}>
            Phone
          </label>
          <input id={ids.phone} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(512) 555-0142" className={INPUT} aria-invalid={Boolean(error) && error !== "Name"} />
          {error ? <Refusal>{error}</Refusal> : null}
        </div>
        <div>
          <label htmlFor={ids.note} className={LABEL}>
            Note
          </label>
          <textarea id={ids.note} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={280} placeholder="Their words, not yours" className={cn(INPUT, "h-auto resize-none py-2 text-[14px] leading-snug")} />
        </div>
        <label htmlFor={ids.consent} className="flex items-center gap-3 text-[14px] text-fg">
          <input id={ids.consent} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 accent-[color:var(--accent)]" />
          They asked to be called on this number
        </label>
        <p className="text-[12px] text-fg-subtle">Source: manual. Counts as an assigned opportunity from now</p>
      </form>
    </Sheet>
  );
}
