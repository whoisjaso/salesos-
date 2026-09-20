"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretRight, UploadSimple } from "@phosphor-icons/react";
import { CATEGORY_LABEL, PROVIDERS, providerById, disconnect, type IntegrationProvider, type ProviderConnection } from "@/domain/integrations";
import { useSession } from "@/lib/session";
import { Surface } from "@/components/ui/Surface";
import { LogoTile } from "./LogoTile";
import { ConnectSheet } from "./ConnectSheet";
import { DetailSheet } from "./DetailSheet";
import { isConnected, POPULAR, seedConnections, type ConnectionMap } from "./connect-model";
import { SANDBOX_NOTE } from "./availability";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as IntegrationProvider["category"][];

/** One row height and one left edge for every list on this screen. */
const ROW = "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-hover motion-reduce:transition-none";
const LABEL = "text-[12px] font-medium text-fg-subtle";

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

/**
 * Logos are the list. A tile or row carries a name and nothing else; counts, health and
 * setup live in the source's own sheet.
 */
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

  const connectP = connectId ? providerById[connectId] : null;
  const detailP = detailId ? providerById[detailId] : null;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold leading-none tracking-tight text-fg">Connect</h1>
        {/* Said once here and again in every sheet, because a person can arrive at either. */}
        <p className="mt-1.5 text-[12px] leading-snug text-fg-subtle">{SANDBOX_NOTE}</p>
      </header>

      <section aria-label="Move in your data">
        <Surface padding="none">
          <Link href="/import" className={ROW}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
              <UploadSimple size={20} weight="bold" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-tight text-fg">Import</span>
            <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
          </Link>
        </Surface>
      </section>

      {connected.length ? (
        <section aria-label="Connected" className="flex flex-col gap-2">
          <h2 className={`px-1 ${LABEL}`}>Connected</h2>
          <Surface padding="none">
            <ul className="divide-y divide-line">
              {connected.map((p) => (
                <li key={p.providerId}>
                  <button type="button" onClick={() => setDetailId(p.providerId)} className={ROW}>
                    <LogoTile p={p} size={40} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-tight text-fg">{p.name}</span>
                    <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      ) : null}

      {popular.length ? (
        <section aria-label="Popular" className="flex flex-col gap-2">
          <h2 className={`px-1 ${LABEL}`}>Popular</h2>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-1 sm:px-1">
            {popular.map((p) => (
              <li key={p.providerId} className="shrink-0">
                <button type="button" onClick={() => setConnectId(p.providerId)} className="flex w-[80px] flex-col items-center gap-2 rounded-md py-1 text-center transition-transform active:scale-[0.97] motion-reduce:transition-none">
                  <LogoTile p={p} size={64} />
                  <span className="line-clamp-2 h-[28px] text-[11px] font-medium leading-[14px] text-fg">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="All" className="flex flex-col gap-5">
        <h2 className={`-mb-3 px-1 ${LABEL}`}>All</h2>
        {groups.map((g) => (
          <div key={g.cat} className="flex flex-col gap-2">
            <h3 className="px-1 text-[12px] font-medium text-fg-subtle">{CATEGORY_LABEL[g.cat]}</h3>
            <Surface padding="none">
              <ul className="divide-y divide-line">
                {g.items.map((p) => (
                  <li key={p.providerId}>
                    <button type="button" onClick={() => setConnectId(p.providerId)} className={ROW}>
                      <LogoTile p={p} size={40} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-tight text-fg">{p.name}</span>
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
