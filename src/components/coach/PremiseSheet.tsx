"use client";

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";

export interface PremiseSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
}

/** "Premise is wrong": a rep can correct a mistaken premise (SOS-16). Client state only. */
export function PremiseSheet({ open, onClose, title }: PremiseSheetProps) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Premise is wrong"
      description={title}
      footer={
        sent ? (
          <span className="inline-flex h-8 items-center gap-1.5 text-[13px] text-perf-strong">
            <CheckCircle size={15} weight="bold" aria-hidden />
            Sent for review
          </span>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={text.trim().length === 0} onClick={() => setSent(true)}>
              Send
            </Button>
          </div>
        )
      }
    >
      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-fg-muted">What is wrong, and what evidence shows it?</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sent}
          rows={5}
          placeholder="The unresolved attendances are on my calendar as attended. Provider webhook was down on the 12th."
          className="w-full resize-y rounded-sm border border-line-strong bg-sunken px-3 py-2 text-[14px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-60"
        />
      </label>
    </Sheet>
  );
}
