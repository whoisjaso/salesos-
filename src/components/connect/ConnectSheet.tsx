"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle, CircleNotch, LinkSimple, UploadSimple } from "@phosphor-icons/react";
import { connect, SimulatedAuthorizer, type AuthorizeRequest, type IntegrationProvider, type ProviderConnection } from "@/domain/integrations";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { LogoTile } from "./LogoTile";
import { CheckRows, MonoBlock, SectionLabel, StepRows, useCopy } from "./bits";
import { CONNECT_NOW, CONNECT_TENANT, snippetFor } from "./connect-model";

export interface ConnectSheetProps {
  p: IntegrationProvider | null;
  open: boolean;
  onClose: () => void;
  onConnected: (providerId: string, conn: ProviderConnection) => void;
}

type Phase = "idle" | "approving" | "connected";

const APPROVE_MS = 900;
const APPROVE_MS_REDUCED = 40;

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
  const [conn, setConn] = useState<ProviderConnection | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [acted, setActed] = useState(false);
  const { copied, copy } = useCopy();
  const timer = useRef<number | null>(null);
  const snippet = useMemo(() => (p.auth === "webhook" || p.auth === "none" ? snippetFor(p) : null), [p]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const authorize = () => {
    if (phase !== "idle") return;
    setPhase("approving");
    const req: AuthorizeRequest = { tenantId: CONNECT_TENANT, providerId: p.providerId, redirectUri: "sos://connect", state: `st_${p.providerId}` };
    const { url } = SimulatedAuthorizer.begin(req);
    const code = new URL(url).searchParams.get("code") ?? "";
    timer.current = window.setTimeout(async () => {
      const result = await SimulatedAuthorizer.complete(req, code);
      const next = connect(undefined, { tenantId: CONNECT_TENANT, providerId: p.providerId, result, now: CONNECT_NOW });
      setConn(next);
      setPhase("connected");
      onConnected(p.providerId, next);
    }, reduce ? APPROVE_MS_REDUCED : APPROVE_MS);
  };

  /** Webhook, share link, and file: the owner did the step, mark it connected. */
  const finish = () => {
    const next = connect(undefined, {
      tenantId: CONNECT_TENANT,
      providerId: p.providerId,
      result: { ok: true, accountLabel: p.auth === "webhook" ? "Webhook" : p.name, grantedPermissions: p.permissions },
      now: CONNECT_NOW,
    });
    onConnected(p.providerId, next);
    onClose();
  };

  const fade = reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {phase === "connected" && conn ? (
        <motion.div key="done" {...fade} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col items-center gap-5 pt-2 text-center">
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="relative"
          >
            <LogoTile p={p} size={72} />
            <span className="absolute -bottom-1.5 -right-1.5 grid place-items-center rounded-full bg-overlay p-0.5">
              <CheckCircle size={26} weight="fill" aria-hidden className="text-perf-strong" />
            </span>
          </motion.span>
          <div>
            <div className="text-[17px] font-semibold text-fg">{p.name}</div>
            <div className="mt-0.5 text-[13px] text-fg-muted">{conn.accountLabel}</div>
          </div>
          {conn.grantedPermissions.length ? (
            <div className="w-full text-left">
              <SectionLabel className="mb-2">Granted</SectionLabel>
              <CheckRows items={conn.grantedPermissions} />
            </div>
          ) : null}
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
              <div className="mt-0.5 text-[13px] text-fg-muted">{p.oneLiner}</div>
            </div>
          </div>

          {p.permissions.length ? (
            <div>
              <SectionLabel className="mb-2">This lets Sales OS</SectionLabel>
              <CheckRows items={p.permissions} />
            </div>
          ) : null}

          <div>
            <SectionLabel className="mb-2">Setup</SectionLabel>
            <StepRows items={p.setup} />
          </div>

          {p.auth === "api_key" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-fg-subtle">API key</span>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={p.providerId === "twilio" ? "Account SID and token" : "Paste key"}
                className="h-10 rounded-sm border border-line-strong bg-sunken px-3 font-mono text-[13px] text-fg placeholder:text-fg-faint focus:border-line-focus focus:outline-none"
              />
            </label>
          ) : null}

          {p.auth === "webhook" && snippet ? (
            <div className="flex flex-col gap-3">
              <MonoBlock label="Webhook URL" text={snippet.url} copied={copied === "url"} onCopy={() => copy("url", snippet.url)} />
              {snippet.html ? <MonoBlock label="Form" text={snippet.html} copied={copied === "html"} onCopy={() => copy("html", snippet.html ?? "")} /> : null}
            </div>
          ) : null}

          {p.auth === "none" && p.providerId !== "csv" && snippet ? (
            <MonoBlock label="Your link" text={snippet.url} copied={copied === "link"} onCopy={() => copy("link", snippet.url)} />
          ) : null}

          <div className="flex flex-col gap-2">
            {p.auth === "oauth" ? (
              <Button onClick={authorize} disabled={phase === "approving"} className="w-full" leading={phase === "approving" ? <CircleNotch size={16} weight="bold" className="animate-spin motion-reduce:animate-none" /> : undefined}>
                {phase === "approving" ? `Approving in ${p.name}` : `Connect with ${p.name}`}
              </Button>
            ) : null}
            {p.auth === "api_key" ? (
              <Button onClick={authorize} disabled={phase === "approving" || apiKey.trim().length === 0} className="w-full" leading={phase === "approving" ? <CircleNotch size={16} weight="bold" className="animate-spin motion-reduce:animate-none" /> : undefined}>
                {phase === "approving" ? `Checking with ${p.name}` : "Connect"}
              </Button>
            ) : null}
            {p.auth === "webhook" ? (
              <Button onClick={finish} className="w-full">
                Done
              </Button>
            ) : null}
            {p.auth === "none" && p.providerId === "csv" ? (
              acted ? (
                <Button onClick={finish} className="w-full">
                  Done
                </Button>
              ) : (
                <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-transparent bg-accent px-4 text-[14px] font-medium text-accent-fg hover:bg-accent-strong">
                  <UploadSimple size={16} weight="bold" aria-hidden />
                  Upload file
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setActed(e.target.files !== null && e.target.files.length > 0)} />
                </label>
              )
            ) : null}
            {p.auth === "none" && p.providerId !== "csv" && snippet ? (
              acted ? (
                <Button onClick={finish} className="w-full">
                  Done
                </Button>
              ) : (
                <Button
                  onClick={async () => {
                    if (await copy("link", snippet.url)) setActed(true);
                  }}
                  className="w-full"
                  leading={<LinkSimple size={16} weight="bold" />}
                >
                  Copy link
                </Button>
              )
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
