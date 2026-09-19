"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Check, Hourglass, PaperPlaneTilt, ArrowsClockwise } from "@phosphor-icons/react";
import type { Contact, User } from "@/domain/types";
import type { Dataset } from "@/domain/metrics";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { BOOKING_TZ, formatDayIn, formatTimeIn, generateSlots, zoneAbbrev, type BookingSlot } from "@/lib/workspace-setter";

export interface Booking {
  appointmentId: string;
  instanceId: string;
  slot: BookingSlot;
  purpose: string;
  durationMinutes: number;
  invitationSent: boolean;
  customerConfirmed: boolean;
  supersedesInstanceId?: string;
}

export interface BookingSheetProps {
  open: boolean;
  onClose: () => void;
  dataset: Dataset;
  now: string;
  contact: Contact;
  closers: User[];
  initialPurpose: string;
  /** Bookings already made in this session for the opportunity, oldest first. */
  bookings: Booking[];
  onBook: (booking: Booking) => void;
}

let seq = 0;

/**
 * Real slots, correct timezone, purpose in the customer's terms, duration, rep.
 * Confirm yields an appointment ID. "Invitation sent" is never "customer confirmed" (SOS-09, SOS-12).
 */
export function BookingSheet({ open, onClose, dataset, now, contact, closers, initialPurpose, bookings, onBook }: BookingSheetProps) {
  const slots = useMemo(() => generateSlots(dataset, now, closers.map((c) => c.userId)), [dataset, now, closers]);
  const current = bookings[bookings.length - 1];
  const [mode, setMode] = useState<"pick" | "confirmed">(current ? "confirmed" : "pick");
  const [slotId, setSlotId] = useState<string | undefined>(slots[0]?.id);
  const [purpose, setPurpose] = useState(initialPurpose);
  const [repId, setRepId] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const slot = slots.find((s) => s.id === slotId);
  const effectiveRep = repId ?? slot?.repUserId;
  const repName = (id?: string) => closers.find((c) => c.userId === id)?.displayName ?? "Unassigned";
  const tz = slot ? zoneAbbrev(slot.startIso, BOOKING_TZ) : "CT";
  const taken = new Set(bookings.map((b) => b.slot.id));

  const confirm = () => {
    if (!slot || !effectiveRep || pending) return;
    setPending(true);
    seq += 1;
    const booking: Booking = {
      appointmentId: current?.appointmentId ?? `apt_new_${String(seq).padStart(3, "0")}`,
      instanceId: `inst_new_${String(seq).padStart(3, "0")}`,
      slot: { ...slot, repUserId: effectiveRep },
      purpose: purpose.trim() || initialPurpose,
      durationMinutes: 45,
      invitationSent: true,
      customerConfirmed: false,
      supersedesInstanceId: current?.instanceId,
    };
    onBook(booking);
    setPending(false);
    setMode("confirmed");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "pick" ? (current ? "Reschedule" : "Book") : "Booked"}
      description={contact.displayName}
      footer={
        mode === "pick" ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button size="md" onClick={confirm} disabled={!slot || pending} leading={<CalendarCheck size={16} weight="bold" />} className="flex-1">
              Confirm
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={() => setMode("pick")} leading={<ArrowsClockwise size={15} weight="bold" />} className="flex-1">
              Reschedule
            </Button>
            <Button size="md" onClick={onClose} className="flex-1">
              Done
            </Button>
          </div>
        )
      }
    >
      {mode === "pick" ? (
        <div className="flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Slot, {tz}</legend>
            <div className="grid grid-cols-2 gap-2">
              {slots.map((s) => {
                const selected = s.id === slotId;
                const used = taken.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={used}
                    onClick={() => {
                      setSlotId(s.id);
                      setRepId(undefined);
                    }}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-14 flex-col items-start justify-center rounded-sm border px-3 text-left transition-colors motion-reduce:transition-none disabled:opacity-40",
                      selected ? "border-accent bg-accent-soft" : "border-line-strong bg-raised hover:bg-hover",
                    )}
                  >
                    <span className="text-[12px] text-fg-muted">{formatDayIn(s.startIso, BOOKING_TZ)}</span>
                    <span className="tabular text-[15px] font-medium text-fg">{formatTimeIn(s.startIso, BOOKING_TZ)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Purpose, customer&apos;s words</span>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-sm border border-line-strong bg-raised px-3 py-2 text-[14px] leading-snug text-fg outline-none focus-visible:border-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm border border-line px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Duration</div>
              <div className="tabular text-[14px] font-medium text-fg">45 min</div>
            </div>
            <label className="rounded-sm border border-line px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Rep</div>
              <select value={effectiveRep ?? ""} onChange={(e) => setRepId(e.target.value)} className="w-full bg-transparent text-[14px] font-medium text-fg outline-none">
                {closers.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : current ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line bg-sunken p-4">
            <div className="tabular text-[12px] text-fg-subtle">{current.appointmentId}</div>
            <div className="mt-1 text-[18px] font-semibold text-fg">
              {formatDayIn(current.slot.startIso, BOOKING_TZ)}, {formatTimeIn(current.slot.startIso, BOOKING_TZ)} {zoneAbbrev(current.slot.startIso, BOOKING_TZ)}
            </div>
            <div className="mt-0.5 text-[13px] text-fg-muted">
              {current.durationMinutes} min with {repName(current.slot.repUserId)}
            </div>
            <p className="mt-3 text-[13px] italic leading-snug text-fg-muted">&ldquo;{current.purpose}&rdquo;</p>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            <li className="flex items-center gap-2.5 px-3 py-2.5 text-[13px]">
              <PaperPlaneTilt size={15} weight="bold" aria-hidden className="text-perf-strong" />
              <span className="text-fg">Invitation sent</span>
              <Check size={14} weight="bold" aria-hidden className="ml-auto text-perf-strong" />
            </li>
            <li className="flex items-center gap-2.5 px-3 py-2.5 text-[13px]">
              <Hourglass size={15} weight="bold" aria-hidden className="text-fg-subtle" />
              <span className="text-fg">Customer confirmed</span>
              <span className="ml-auto text-[12px] text-fg-subtle">Not yet</span>
            </li>
          </ul>
          {bookings.length > 1 ? (
            <ol className="flex flex-col gap-1.5" aria-label="Reschedule lineage">
              {[...bookings].reverse().map((b, i) => (
                <li key={b.instanceId} className={cn("tabular flex items-center justify-between rounded-sm border border-line px-3 py-2 text-[12px]", i === 0 ? "text-fg" : "text-fg-subtle line-through")}>
                  <span>
                    {b.instanceId} {b.supersedesInstanceId ? `supersedes ${b.supersedesInstanceId}` : ""}
                  </span>
                  <span>{formatTimeIn(b.slot.startIso, BOOKING_TZ)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
