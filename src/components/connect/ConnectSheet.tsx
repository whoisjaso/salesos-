"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ClockCounterClockwise, UploadSimple, Wrench } from "@phosphor-icons/react";
import { connect, type IntegrationProvider, type ProviderConnection } from "@/domain/integrations";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { LogoTile } from "./LogoTile";
import { CheckRows, MonoBlock, SectionLabel, StepRows, useCopy } from "./bits";
import { CONNECT_NOW, CONNECT_TENANT, snippetFor } from "./connect-model";
import { SANDBOX_NOTE, connectViewFor } from "./availability";

export interface ConnectSheetProps {
  p: IntegrationProvider | null;
  open: boolean;
  onClose: () => void;
  onConnected: (providerId: string, conn: ProviderConnection) => void;
}

/**
 * Two reachable phases and no third.
 * "requested" is an interest note on this device. It is not an authorization,
 * it shows no check mark, and it lists no permission as granted (specification
 * 12.1, docs/PAYMENTS_AUDIT.md H1).
 */
type Phase = "idle" | "requested";

export function ConnectSheet({ p, open, onClose, onConnected }: ConnectSheetProps) {
  return (
    <Sheet open={open && !!p} onClose={onClose} title="Connect" width={460}>
      {p ? <Body key={p.providerId} p={p} onClose={onClose} onConnected={onConnected} /> : null}
    </Sheet>
  );
}

function Body({ p, onClose, onConnected }: { p: IntegrationProvider; onClose: () => void; onConnected: ConnectSheetProps["onConnected"] }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploaded, setUploaded] = useState(false);
  const { copied, copy } = useCopy();
  const view = useMemo(() => connectViewFor(p), [p]);
  const snippet = useMemo(() => (p.auth === "webhook" || p.auth === "none" ? snippetFor(p) : null), [p]);

  /**
   * The spreadsheet is the one completed path: the owner picked a real file and
   * this app read it. It is still not a provider grant, so no permission is
   * recorded as granted and the account line names the file source, not a
   * fabricated merchant account.
   */
  const finishFileImport = () => {
    const next = connect(undefined, {
      tenantId: CONNECT_TENANT,
      providerId: p.providerId,
      result: { ok: true, accountLabel: "File you uploaded", grantedPermissions: [] },
      now: CONNECT_NOW,
    });
    onConnected(p.providerId, next);
    onClose();
  };

  const fade = reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {phase === "requested" ? (
        <motion.div key="requested" {...fade} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col items-center gap-5 pt-2 text-center">
          {/* The real brand mark stays. What is gone is the filled check that used
              to sit on it: the mark is identity, the check was a claim. */}
          <LogoTile p={p} size={72} />
          <div>
            <div className="text-[17px] font-semibold text-fg">{p.name}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
              <ClockCounterClockwise size={14} weight="bold" aria-hidden />
              Connection requested
            </div>
          </div>
          <p className="text-[13px] leading-snug text-fg-muted">
            Recorded on this device. Nothing was sent to {p.name}, no permission was requested and none was granted. {SANDBOX_NOTE}
          </p>
          <Button onClick={onClose} className="mt-1 w-full">
            Done
          </Button>
        </motion.div>
      ) : (
        <motion.div key="form" {...fade} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <LogoTile p={p} size={72} />
            <div>
              <div className="text-[17px] font-semibold text-fg">{p.name}</div>
              <div className="mt-0.5 text-[13px] text-fg-muted">{view.subtitle}</div>
            </div>
            {/* Every state has a text label and an icon, never a colour on its own. */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-[12px] font-medium text-fg-muted">
              {view.canConnect ? <UploadSimple size={13} weight="bold" aria-hidden /> : <Wrench size={13} weight="bold" aria-hidden />}
              {view.statusLabel}
            </span>
          </div>

          {p.permissions.length ? (
            <div>
              <SectionLabel className="mb-2">{view.permissionsHeading}</SectionLabel>
              <CheckRows items={p.permissions} />
              <p className="mt-2 text-[12px] leading-snug text-fg-subtle">{view.permissionsNote}</p>
            </div>
          ) : null}

          <div>
            <SectionLabel className="mb-2">{view.setupHeading}</SectionLabel>
            <StepRows items={p.setup} />
          </div>

          {snippet ? (
            <div className="flex flex-col gap-3">
              {view.snippetCaveat ? <p className="text-[12px] leading-snug text-fg-subtle">{view.snippetCaveat}</p> : null}
              <MonoBlock label="Webhook URL" text={snippet.url} copied={copied === "url"} onCopy={() => copy("url", snippet.url)} />
              {snippet.html ? <MonoBlock label="Form" text={snippet.html} copied={copied === "html"} onCopy={() => copy("html", snippet.html ?? "")} /> : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {view.action === "connect" ? (
              /*
                Reachable only when the domain says a real onboarding path exists.
                No provider does today, so this renders for nobody. It is disabled
                rather than wired to a stand-in, because the authorization step
                itself is not built: a button that looks ready and is not is the
                same lie one layer down.
              */
              <Button disabled className="w-full">
                {view.actionLabel}
              </Button>
            ) : view.action === "upload_file" ? (
              uploaded ? (
                <Button onClick={finishFileImport} className="w-full">
                  Done
                </Button>
              ) : (
                <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-transparent bg-accent px-4 text-[14px] font-medium text-accent-fg hover:bg-accent-strong">
                  <UploadSimple size={16} weight="bold" aria-hidden />
                  {view.actionLabel}
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setUploaded(e.target.files !== null && e.target.files.length > 0)} />
                </label>
              )
            ) : (
              <Button onClick={() => setPhase("requested")} className="w-full">
                {view.actionLabel}
              </Button>
            )}
            <p className="text-[12px] leading-snug text-fg-subtle">{view.actionEffect}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
