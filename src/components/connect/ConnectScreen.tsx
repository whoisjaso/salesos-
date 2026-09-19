"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react";
import { CATEGORY_LABEL, PROVIDERS, providerById, disconnect, type IntegrationProvider, type ProviderConnection } from "@/domain/integrations";
import { useSession } from "@/lib/session";
import { formatCount } from "@/lib/format";
import { Surface } from "@/components/ui/Surface";
import { LogoTile } from "./LogoTile";
import { ConnectSheet } from "./ConnectSheet";
import { DetailSheet, TONE_DOT } from "./DetailSheet";
import { connectedCount, isConnected, leadsLast7d, POPULAR, seedConnections, toneOf, type ConnectionMap } from "./connect-model";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as IntegrationProvider["category"][];

/** Owner only. Reps are sent home. */
export function ConnectScreen() {
  const router = useRouter();
  const { session, ready } = useSession();
  const owner = !!session && session.role === "owner";

  useEffect(() => {
    if (ready && !owner) router.replace("/");
  }, [ready, owner, router]);

  if (!ready || !owner) return null;
  return <ConnectBody />;
}

function ConnectBody() {
  const [map, setMap] = useState<ConnectionMap>(seedConnections);
  const [connectId, setConnectId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const connected = useMemo(() => PROVIDERS.filter((p) => isConnected(map[p.providerId])), [map]);
  const popular = useMemo(() => POPULAR.filter((p) => !isConnected(map[p.providerId])), [map]);
  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({ cat, items: PROVIDERS.filter((p) => p.category === cat && !isConnected(map[p.providerId])) })).filter((g) => g.items.length > 0),
    [map],
  );

  const onConnected = (providerId: string, conn: ProviderConnection) => setMap((m) => ({ ...m, [providerId]: { conn } }));
  const onPause = (providerId: string) =>
    setMap((m) => {
      const c = m[providerId];
      if (!c) return m;
      return { ...m, [providerId]: { ...c, conn: { ...c.conn, status: c.conn.status === "paused" ? "connected" : "paused" } } };
    });
  const onDisconnect = (providerId: string) =>
    setMap((m) => {
      const c = m[providerId];
      if (!c) return m;
      return { ...m, [providerId]: { conn: disconnect(c.conn) } };
    });

  const count = connectedCount(map);
  const leads = leadsLast7d(map);
  const connectP = connectId ? providerById[connectId] : null;
  const detailP = detailId ? providerById[detailId] : null;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <header className="px-1">
        <h1 className="text-[30px] font-semibold leading-none tracking-tight text-fg">Connect</h1>
        <p className="tabular mt-2 flex items-center gap-2 text-[13px] text-fg-muted">
          <span>{formatCount(count)} connected</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-fg-faint" />
          <span>{formatCount(leads)} leads, 7 days</span>
        </p>
      </header>

      {connected.length ? (
        <section aria-label="Connected" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-medium text-fg-muted">Connected</h2>
            <span className="text-[11.5px] text-fg-subtle">7 days</span>
          </div>
          <Surface padding="none">
            <ul className="divide-y divide-line">
              {connected.map((p) => {
                const c = map[p.providerId];
                const tone = toneOf(c);
                return (
                  <li key={p.providerId}>
                    <button type="button" onClick={() => setDetailId(p.providerId)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-hover motion-reduce:transition-none">
                      <LogoTile p={p} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-tight text-fg">{p.name}</span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-fg-subtle">{c.conn.accountLabel}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular text-[15px] font-semibold text-fg">{c.health ? formatCount(c.health.receivedLast7d) : "New"}</span>
                        <span aria-hidden className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
                      </span>
                      <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Surface>
        </section>
      ) : null}

      {popular.length ? (
        <section aria-label="Popular" className="flex flex-col gap-2">
          <h2 className="px-1 text-[13px] font-medium text-fg-muted">Popular</h2>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-1 sm:px-1">
            {popular.map((p) => (
              <li key={p.providerId} className="shrink-0">
                <button type="button" onClick={() => setConnectId(p.providerId)} className="flex w-[84px] flex-col items-center gap-2 rounded-md py-1 text-center transition-transform active:scale-[0.97] motion-reduce:transition-none">
                  <LogoTile p={p} size={64} />
                  <span className="line-clamp-2 text-[11.5px] font-medium leading-tight text-fg">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="All" className="flex flex-col gap-5">
        <h2 className="-mb-3 px-1 text-[13px] font-medium text-fg-muted">All</h2>
        {groups.map((g) => (
          <div key={g.cat} className="flex flex-col gap-2">
            <h3 className="px-1 text-[12px] font-medium uppercase tracking-[0.04em] text-fg-subtle">{CATEGORY_LABEL[g.cat]}</h3>
            <Surface padding="none">
              <ul className="divide-y divide-line">
                {g.items.map((p) => (
                  <li key={p.providerId}>
                    <button type="button" onClick={() => setConnectId(p.providerId)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-hover motion-reduce:transition-none">
                      <LogoTile p={p} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium leading-tight text-fg">{p.name}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-fg-subtle">{p.oneLiner}</span>
                      </span>
                      <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            </Surface>
          </div>
        ))}
      </section>

      <ConnectSheet p={connectP} open={connectId !== null} onClose={() => setConnectId(null)} onConnected={onConnected} />
      <DetailSheet p={detailP} c={detailId ? (map[detailId] ?? null) : null} open={detailId !== null} onClose={() => setDetailId(null)} onPause={onPause} onDisconnect={onDisconnect} />
    </div>
  );
}
