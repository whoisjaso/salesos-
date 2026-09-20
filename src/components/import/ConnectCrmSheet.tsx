"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleNotch } from "@phosphor-icons/react";
import { connectAndPull, simulatedCrmSync, type CrmSyncAdapter, type SyncProgress, type SyncResult } from "@/domain/crmSync";
import type { AuthorizeRequest } from "@/domain/integrations";
import { parseCsv } from "@/domain/migration";
import { formatCount } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { LogoTile } from "@/components/connect/LogoTile";
import { CheckRows, SectionLabel } from "@/components/connect/bits";
import { simulatedCsv, type CrmSource } from "./import-model";

export interface ConnectCrmSheetProps {
  source: CrmSource | null;
  open: boolean;
  tenantId: string;
  onClose: () => void;
  onPulled: (source: CrmSource, sync: SyncResult) => void;
}

type Phase = "idle" | "approving" | "pulling" | "failed";

const APPROVE_MS = 900;
const PAGE_MS = 220;
const REDUCED_MS = 40;

/** Same shape as ConnectSheet: permissions in plain words, one button, a simulated approve, then the pull. */
export function ConnectCrmSheet({ source, open, tenantId, onClose, onPulled }: ConnectCrmSheetProps) {
  return (
    <Sheet open={open && !!source} onClose={onClose} title="Connect" width={460}>
      {source ? <Body key={source.provider.providerId} source={source} tenantId={tenantId} onPulled={onPulled} /> : null}
    </Sheet>
  );
}

const OBJECT_WORD: Record<SyncProgress["object"], string> = { contacts: "contacts", deals: "deals", appointments: "appointments", payments: "payments", notes: "notes" };

function Body({ source, tenantId, onPulled }: { source: CrmSource; tenantId: string; onPulled: ConnectCrmSheetProps["onPulled"] }) {
  const reduce = useReducedMotion();
  const p = source.provider;
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ word: string; fetched: number; total: number } | null>(null);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const authorize = () => {
    if (phase !== "idle") return;
    setPhase("approving");
    const csv = simulatedCsv(source.preset);
    const total = parseCsv(csv).rows.length;
    const adapter = paced(simulatedCrmSync(source.preset, csv), reduce ? REDUCED_MS : PAGE_MS);
    const request: AuthorizeRequest = { tenantId, providerId: p.providerId, redirectUri: "/import", state: "x" };
    timer.current = window.setTimeout(async () => {
      if (!alive.current) return;
      setPhase("pulling");
      setProgress({ word: OBJECT_WORD.contacts, fetched: 0, total });
      const result = await connectAndPull({
        adapter,
        request,
        code: `simulated_${p.providerId}`,
        scope: { objects: ["contacts", "deals", "appointments", "payments"] },
        onProgress: (pr) => {
          if (alive.current && pr.object === "contacts") setProgress({ word: OBJECT_WORD[pr.object], fetched: pr.fetched, total });
        },
      });
      if (!alive.current) return;
      if (!result.auth.ok || !result.sync) {
        setPhase("failed");
        return;
      }
      onPulled(source, result.sync);
    }, reduce ? REDUCED_MS : APPROVE_MS);
  };

  const fade = reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };
  const ratio = progress && progress.total > 0 ? Math.min(1, progress.fetched / progress.total) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <LogoTile p={p} size={72} />
        <div>
          <div className="text-[17px] font-semibold text-fg">{p.name}</div>
          <div className="mt-0.5 text-[13px] text-fg-muted">{p.oneLiner}</div>
        </div>
      </div>

      {p.permissions.length ? (
        <div>
          <SectionLabel className="mb-2">This lets Sales OS</SectionLabel>
          <CheckRows items={p.permissions} />
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {phase === "pulling" && progress ? (
          <motion.div key="pull" {...fade} transition={{ duration: 0.2 }} className="flex flex-col gap-2" role="status" aria-live="polite">
            <div className="h-1 overflow-hidden rounded-full bg-line-strong">
              <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <div className="tabular text-[13px] text-fg-muted">
              Pulling {progress.word} {formatCount(progress.fetched)} of {formatCount(progress.total)}
            </div>
          </motion.div>
        ) : (
          <motion.div key="btn" {...fade} transition={{ duration: 0.2 }} className="flex flex-col gap-2">
            <Button onClick={authorize} disabled={phase === "approving"} className="w-full" leading={phase === "approving" ? <CircleNotch size={16} weight="bold" className="animate-spin motion-reduce:animate-none" /> : undefined}>
              {phase === "approving" ? `Approving in ${p.name}` : `Connect with ${p.name}`}
            </Button>
            {phase === "failed" ? (
              <p role="alert" className="text-center text-[13px] text-perf-issue">
                {p.name} did not approve
              </p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Space the pages out so the pull reads as progress instead of a flash. Simulation only. */
function paced(adapter: CrmSyncAdapter, ms: number): CrmSyncAdapter {
  return {
    ...adapter,
    async pull(object, cursor) {
      await new Promise((r) => window.setTimeout(r, ms));
      return adapter.pull(object, cursor);
    },
  };
}
