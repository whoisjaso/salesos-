"use client";

import { useMemo } from "react";
import { Pause, Play, Plugs } from "@phosphor-icons/react";
import type { IntegrationProvider } from "@/domain/integrations";
import { formatCount, formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { LogoTile } from "./LogoTile";
import { CheckRows, MonoBlock, SectionLabel, useCopy } from "./bits";
import { CONNECT_NOW, isWebhook, snippetFor, toneOf, type Connection, type Tone } from "./connect-model";

export interface DetailSheetProps {
  p: IntegrationProvider | null;
  c: Connection | null;
  open: boolean;
  onClose: () => void;
  onPause: (providerId: string) => void;
  onDisconnect: (providerId: string) => void;
}

const TONE_LABEL: Record<Tone, string> = { live: "Live", stale: "Quiet", paused: "Paused" };
export const TONE_DOT: Record<Tone, string> = { live: "bg-perf-strong", stale: "bg-fg-faint", paused: "bg-perf-attention" };

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <LogoTile p={p} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
            <span aria-hidden className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
            {TONE_LABEL[tone]}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-fg-subtle">{last ? `Last lead ${formatRelativeTime(last, CONNECT_NOW)}` : "No leads yet"}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat value={c.health?.receivedLast24h ?? 0} label="24 hours" />
        <Stat value={c.health?.receivedLast7d ?? 0} label="7 days" />
        <Stat value={c.conn.eventCount} label="All time" />
      </div>

      {c.conn.grantedPermissions.length ? (
        <div>
          <SectionLabel className="mb-2">Granted</SectionLabel>
          <CheckRows items={c.conn.grantedPermissions} />
        </div>
      ) : null}

      {snippet ? (
        <div className="flex flex-col gap-3">
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-sm border border-line bg-sunken px-3 py-2.5">
      <div className="tabular text-[20px] font-semibold leading-none text-fg">{formatCount(value)}</div>
      <div className="mt-1.5 text-[11.5px] text-fg-subtle">{label}</div>
    </div>
  );
}
