"use client";

import { useMemo } from "react";
import { Circle, Flask, Pause, Play, Plugs } from "@phosphor-icons/react";
import type { IntegrationProvider } from "@/domain/integrations";
import { formatCount, formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { LogoTile } from "./LogoTile";
import { CheckRows, MonoBlock, SectionLabel, useCopy } from "./bits";
import { CONNECT_NOW, isWebhook, snippetFor, toneOf, type Connection, type Tone } from "./connect-model";
import { connectViewFor } from "./availability";

export interface DetailSheetProps {
  p: IntegrationProvider | null;
  c: Connection | null;
  open: boolean;
  onClose: () => void;
  onPause: (providerId: string) => void;
  onDisconnect: (providerId: string) => void;
}

export const TONE_LABEL: Record<Tone, string> = {
  fixture: "Synthetic fixture",
  live: "Live",
  stale: "Quiet",
  paused: "Paused",
};
export const TONE_DOT: Record<Tone, string> = {
  fixture: "bg-fg-faint",
  live: "bg-perf-strong",
  stale: "bg-fg-faint",
  paused: "bg-perf-attention",
};

/** One sentence under the state, so the state is never a colour and a word alone. */
export const TONE_NOTE: Record<Tone, string> = {
  fixture: "Every figure below is fixture data. This feed has never received anything.",
  live: "Received something in the last 24 hours.",
  stale: "Nothing received in the last 24 hours.",
  paused: "Paused by you. Nothing is being read.",
};

export function DetailSheet({ p, c, open, onClose, onPause, onDisconnect }: DetailSheetProps) {
  return (
    <Sheet open={open && !!p && !!c} onClose={onClose} title={p?.name ?? ""} description={c?.conn.accountLabel} width={460}>
      {p && c ? <Body key={p.providerId} p={p} c={c} onClose={onClose} onPause={onPause} onDisconnect={onDisconnect} /> : null}
    </Sheet>
  );
}

function Body({ p, c, onClose, onPause, onDisconnect }: { p: IntegrationProvider; c: Connection } & Pick<DetailSheetProps, "onClose" | "onPause" | "onDisconnect">) {
  const { copied, copy } = useCopy();
  const tone = toneOf(c);
  const paused = c.conn.status === "paused";
  const last = c.health?.lastReceivedAt ?? c.conn.lastEventAt;
  const snippet = useMemo(() => (isWebhook(p) ? snippetFor(p, c) : null), [p, c]);
  const view = useMemo(() => connectViewFor(p), [p]);
  const fixture = tone === "fixture";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <LogoTile p={p} size={56} />
        <div className="min-w-0 flex-1">
          {/* Text label and an icon. The dot alone never carries the state. */}
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
            {fixture ? (
              <Flask size={13} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
            ) : (
              <Circle size={9} weight="fill" aria-hidden className={`shrink-0 rounded-full ${TONE_DOT[tone]} text-transparent`} />
            )}
            {TONE_LABEL[tone]}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-fg-subtle">
            {last ? `Last lead ${formatRelativeTime(last, CONNECT_NOW)}` : "No leads yet"}
          </div>
        </div>
      </div>

      <p className="-mt-2 text-[12px] leading-snug text-fg-subtle">{TONE_NOTE[tone]}</p>

      <div className="grid grid-cols-3 gap-2">
        <Stat value={c.health?.receivedLast24h ?? 0} label="24 hours" fixture={fixture} />
        <Stat value={c.health?.receivedLast7d ?? 0} label="7 days" fixture={fixture} />
        <Stat value={c.conn.eventCount} label="All time" fixture={fixture} />
      </div>

      {/*
        Nothing here is ever headed "Granted". A grant is something a provider
        returned, and no provider has returned one in this build; the catalog
        list is what a connection would ask for (specification 12.1).
      */}
      {c.conn.grantedPermissions.length ? (
        <div>
          <SectionLabel className="mb-2">Granted by {p.name}</SectionLabel>
          <CheckRows items={c.conn.grantedPermissions} />
        </div>
      ) : p.permissions.length ? (
        <div>
          <SectionLabel className="mb-2">{view.permissionsHeading}</SectionLabel>
          <CheckRows items={p.permissions} />
          <p className="mt-2 text-[12px] leading-snug text-fg-subtle">{view.permissionsNote}</p>
        </div>
      ) : null}

      {snippet ? (
        <div className="flex flex-col gap-3">
          {view.snippetCaveat ? <p className="text-[12px] leading-snug text-fg-subtle">{view.snippetCaveat}</p> : null}
          <MonoBlock label="Webhook URL" text={snippet.url} copied={copied === "url"} onCopy={() => copy("url", snippet.url)} />
          {snippet.html ? <MonoBlock label="Form" text={snippet.html} copied={copied === "html"} onCopy={() => copy("html", snippet.html ?? "")} /> : null}
        </div>
      ) : null}

      <div className="flex gap-2 border-t border-line pt-4">
        <Button variant="ghost" className="flex-1" onClick={() => onPause(p.providerId)} leading={paused ? <Play size={15} weight="bold" /> : <Pause size={15} weight="bold" />}>
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="ghost"
          className="flex-1 text-perf-issue hover:text-perf-issue"
          onClick={() => {
            onDisconnect(p.providerId);
            onClose();
          }}
          leading={<Plugs size={15} weight="bold" />}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function Stat({ value, label, fixture }: { value: number; label: string; fixture: boolean }) {
  return (
    <div className="rounded-sm border border-line bg-sunken px-3 py-2.5">
      <div className="tabular text-[20px] font-semibold leading-none text-fg" aria-label={fixture ? `${formatCount(value)} in the last ${label}, fixture data` : undefined}>
        {formatCount(value)}
      </div>
      <div className="mt-1.5 text-[11.5px] text-fg-subtle">{fixture ? `${label}, fixture` : label}</div>
    </div>
  );
}
