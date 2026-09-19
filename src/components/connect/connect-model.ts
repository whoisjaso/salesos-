/**
 * Client-side model for the owner's Connect screen.
 * Seeds provider connections from the five fixture SourceConnections, then
 * everything else is plain React state. Nothing persists (D04 pending).
 */
import { ingest, sourceHealth, trackingSnippet, type SourceConnection, type SourceHealthRow, type SourceKind, type TrackingSnippet } from "@/domain/intake";
import { PROVIDERS, providerById, type IntegrationProvider, type ProviderConnection } from "@/domain/integrations";
import { sampleInbound, sourceById, sourceConnections, SOURCES_NOW, SOURCES_TENANT_ID } from "@/fixtures/sources";

export const CONNECT_NOW = SOURCES_NOW;
export const CONNECT_TENANT = SOURCES_TENANT_ID;

/** Fixture source -> catalog provider. */
const SOURCE_PROVIDER: Record<string, string> = {
  src_meta_dealer_video: "meta_ads",
  src_vsl_landing: "landing_page",
  src_calendly_demo: "calendly",
  src_ig_dm_link: "instagram",
  src_csv_legacy: "csv",
};

/** Catalog provider -> intake source kind, for snippets on providers connected in-session. */
const PROVIDER_KIND: Record<string, SourceKind> = {
  meta_ads: "meta_lead_form",
  google_ads: "google_lead_form",
  landing_page: "webhook_form",
  clickfunnels: "webhook_form",
  webflow: "webhook_form",
  typeform: "webhook_form",
  calendly: "calendar_booking",
  cal_com: "calendar_booking",
  google_calendar: "calendar_booking",
  gohighlevel: "calendar_booking",
  instagram: "share_link",
  share_link: "share_link",
  zapier: "zapier_make",
  make: "zapier_make",
  csv: "csv_import",
};

export interface Connection {
  conn: ProviderConnection;
  source?: SourceConnection;
  health?: SourceHealthRow;
}

export type ConnectionMap = Record<string, Connection>;

export type Tone = "live" | "stale" | "paused";

const DAY_MS = 24 * 3_600_000;

export function toneOf(c: Connection, now = CONNECT_NOW): Tone {
  if (c.conn.status === "paused") return "paused";
  const last = c.health?.lastReceivedAt ?? c.conn.lastEventAt;
  if (!last) return "stale";
  return Date.parse(now) - Date.parse(last) < DAY_MS ? "live" : "stale";
}

/** The five fixture sources as provider connections, with 7d and 24h counts from the sample inbound payloads. */
export function seedConnections(): ConnectionMap {
  const submissions = sampleInbound.map(
    (raw) => ingest(raw, sourceById(raw.sourceId), { now: CONNECT_NOW, contacts: [], submissions: [], opportunities: [] }).submission,
  );
  const health = sourceHealth(sourceConnections, submissions, CONNECT_NOW);
  const out: ConnectionMap = {};
  for (const source of sourceConnections) {
    const providerId = SOURCE_PROVIDER[source.sourceId];
    const p = providerById[providerId];
    if (!p) continue;
    out[providerId] = {
      source,
      health: health.find((h) => h.sourceId === source.sourceId),
      conn: {
        tenantId: source.tenantId,
        connectionId: `conn_${source.tenantId}_${providerId}`,
        providerId,
        status: source.status === "paused" ? "paused" : "connected",
        accountLabel: source.label,
        grantedPermissions: p.permissions,
        connectedAt: source.createdAt,
        lastEventAt: source.lastReceivedAt,
        eventCount: source.receivedCount,
      },
    };
  }
  return out;
}

export function isConnected(c: Connection | undefined): c is Connection {
  return !!c && (c.conn.status === "connected" || c.conn.status === "paused");
}

export function connectedCount(map: ConnectionMap): number {
  return Object.values(map).filter(isConnected).length;
}

export function leadsLast7d(map: ConnectionMap): number {
  return Object.values(map).reduce((n, c) => n + (c.health?.receivedLast7d ?? 0), 0);
}

/** Count shown on the Me screen row before any client state exists. */
export const SEED_CONNECTED_COUNT = sourceConnections.length;

export function isWebhook(p: IntegrationProvider): boolean {
  return p.auth === "webhook";
}

/** The source the snippet is built from: the fixture one when seeded, a stand-in otherwise. */
export function sourceFor(p: IntegrationProvider, c?: Connection): SourceConnection {
  if (c?.source) return c.source;
  return {
    tenantId: CONNECT_TENANT,
    sourceId: `src_${p.providerId}`,
    kind: PROVIDER_KIND[p.providerId] ?? "webhook_form",
    label: p.name,
    status: "pending",
    createdAt: CONNECT_NOW,
    receivedCount: 0,
    entryPathDefault: p.entryPathDefault,
    consentPolicy: [],
  };
}

export function snippetFor(p: IntegrationProvider, c?: Connection): TrackingSnippet {
  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://app.salesos.example";
  return trackingSnippet(sourceFor(p, c), origin);
}

export const POPULAR = PROVIDERS.filter((p) => p.popular);

/** Primary action word by auth kind. */
export function primaryLabel(p: IntegrationProvider): string {
  switch (p.auth) {
    case "oauth":
      return `Connect with ${p.name}`;
    case "api_key":
      return "Connect";
    case "webhook":
      return "Done";
    case "none":
      return p.providerId === "csv" ? "Upload file" : "Copy link";
  }
}

/** Near-black brand marks render on the foreground color so they read in both themes. */
export function isNearBlack(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.22;
}
