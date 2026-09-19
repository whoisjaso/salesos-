/**
 * OAuth-first CRM sync. Source: docs/DECISIONS.md ("OAuth first, always").
 *
 * The owner taps Connect, authorizes in the old CRM, and the sync adapter pulls their data
 * as tabular pages that feed the migration engine (src/domain/migration.ts). Files and webhooks
 * are the fallback for tools with no OAuth, never the first option.
 *
 * Real adapters exchange the OAuth code server-side and page through the provider API.
 * SimulatedCrmSync stands in until provider app credentials exist (D04).
 */
import type { Authorizer, AuthorizeRequest, AuthorizeResult } from "./integrations";
import { SimulatedAuthorizer } from "./integrations";
import type { SourcePreset } from "./migration";
import { parseCsv } from "./migration";

export type SyncObject = "contacts" | "deals" | "appointments" | "payments" | "notes";

export interface SyncPage {
  object: SyncObject;
  headers: string[];
  rows: string[][];
  nextCursor?: string;
}

export interface SyncScope {
  objects: SyncObject[];
  /** ISO date; only records updated after this. Undefined = full history. */
  since?: string;
}

export interface SyncProgress {
  object: SyncObject;
  fetched: number;
  total?: number;
  done: boolean;
}

export interface CrmSyncAdapter {
  preset: SourcePreset;
  authorizer: Authorizer;
  /** Which objects this CRM exposes through its API. */
  supports(): SyncObject[];
  /** Pull one page. Cursor undefined = first page. */
  pull(object: SyncObject, cursor?: string): Promise<SyncPage>;
  /** Optional: continuous sync after the first import (webhook or polling). */
  subscribe?(handler: (page: SyncPage) => void): () => void;
}

export interface SyncResult {
  preset: SourcePreset;
  headers: string[];
  rows: string[][];
  objects: SyncObject[];
  pagesPulled: number;
}

/** Drain every page of every requested object into one flat table the migration engine understands. */
export async function pullAll(
  adapter: CrmSyncAdapter,
  scope: SyncScope,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const supported = new Set(adapter.supports());
  let headers: string[] = [];
  const rows: string[][] = [];
  let pagesPulled = 0;
  const objects: SyncObject[] = [];
  for (const object of scope.objects) {
    if (!supported.has(object)) continue;
    objects.push(object);
    let cursor: string | undefined;
    let fetched = 0;
    do {
      const page = await adapter.pull(object, cursor);
      pagesPulled++;
      if (headers.length === 0) headers = page.headers;
      for (const r of page.rows) rows.push(r);
      fetched += page.rows.length;
      cursor = page.nextCursor;
      onProgress?.({ object, fetched, done: !cursor });
    } while (cursor);
  }
  return { preset: adapter.preset, headers, rows, objects, pagesPulled };
}

export interface ConnectAndPullInput {
  adapter: CrmSyncAdapter;
  request: AuthorizeRequest;
  code: string;
  scope: SyncScope;
  onProgress?: (p: SyncProgress) => void;
}

export interface ConnectAndPullResult {
  auth: AuthorizeResult;
  sync?: SyncResult;
}

/** The whole owner journey in one call: authorize, then pull. Nothing is pulled if authorization fails. */
export async function connectAndPull(input: ConnectAndPullInput): Promise<ConnectAndPullResult> {
  const auth = await input.adapter.authorizer.complete(input.request, input.code);
  if (!auth.ok) return { auth };
  const sync = await pullAll(input.adapter, input.scope, input.onProgress);
  return { auth, sync };
}

/**
 * Simulated adapter: serves a CSV export (from fixtures) as API pages of `pageSize` rows.
 * Keeps the OAuth handshake shape so the UI flow is identical to production.
 */
export function simulatedCrmSync(preset: SourcePreset, csv: string, pageSize = 5): CrmSyncAdapter {
  const parsed = parseCsv(csv);
  return {
    preset,
    authorizer: SimulatedAuthorizer,
    supports: () => ["contacts", "deals", "appointments", "payments", "notes"],
    async pull(object, cursor) {
      // One flat export covers every object in the simulation; only the first object returns rows.
      if (object !== "contacts") return { object, headers: parsed.headers, rows: [] };
      const start = cursor ? Number(cursor) : 0;
      const rows = parsed.rows.slice(start, start + pageSize);
      const next = start + pageSize < parsed.rows.length ? String(start + pageSize) : undefined;
      return { object, headers: parsed.headers, rows, nextCursor: next };
    },
  };
}

/** Provider ids in the integrations registry that can act as a migration source through OAuth. */
export const OAUTH_CRM_SOURCES: { providerId: string; preset: SourcePreset }[] = [
  { providerId: "hubspot", preset: "hubspot" },
  { providerId: "gohighlevel", preset: "gohighlevel" },
  { providerId: "salesforce", preset: "salesforce" },
  { providerId: "pipedrive", preset: "pipedrive" },
  { providerId: "zoho", preset: "zoho" },
  { providerId: "close", preset: "close" },
];
