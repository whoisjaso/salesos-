/**
 * Repository factory.
 *
 * - When NEXT_PUBLIC_SUPABASE_URL and a key (SUPABASE_SERVICE_ROLE_KEY, or
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY as fallback) are set, returns SupabaseRepository.
 * - Otherwise returns MemoryRepository seeded with the labeled synthetic fixture
 *   (src/fixtures/obavia, export `obaviaDataset`). If that module is absent, the
 *   memory repository starts with an empty dataset so the app still boots.
 *
 * The instance is cached per process. Call `resetRepository()` in tests.
 */

import type { DatasetLike, Repository } from "./repository";
import { MemoryRepository, emptyDataset } from "./memory";
import { SupabaseRepository, readSupabaseEnv } from "./supabase";

export type {
  DatasetLike,
  EventFilter,
  LedgerFilter,
  OpportunityFilter,
  ProviderEvent,
  Repository,
  TimeWindow,
  WriteReason,
  WriteResult,
} from "./repository";
export { MemoryRepository, emptyDataset } from "./memory";
export { SupabaseRepository, readSupabaseEnv } from "./supabase";

export const DEFAULT_TENANT_ID = "tenant_obavia";

let cached: Promise<Repository> | null = null;

function isDatasetLike(value: unknown): value is DatasetLike {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const tenant = v.tenant;
  return (
    typeof tenant === "object" &&
    tenant !== null &&
    typeof (tenant as Record<string, unknown>).tenantId === "string" &&
    Array.isArray(v.opportunities) &&
    Array.isArray(v.tasks) &&
    Array.isArray(v.ledger)
  );
}

/** Loads the fixture dataset, or null when the module is not present or malformed. */
export async function loadFixtureDataset(): Promise<DatasetLike | null> {
  try {
    // The fixture module is owned by the domain/fixtures phase and may not exist yet.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore TS2307 until src/fixtures/obavia.ts lands
    const mod: unknown = await import("@/fixtures/obavia");
    const candidate = (mod as { obaviaDataset?: unknown } | null)?.obaviaDataset;
    return isDatasetLike(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function createRepository(env: NodeJS.ProcessEnv = process.env): Promise<Repository> {
  const supabase = readSupabaseEnv(env);
  if (supabase) return Promise.resolve(new SupabaseRepository(supabase));
  return loadFixtureDataset().then(
    (fixture) => new MemoryRepository(fixture ?? emptyDataset(DEFAULT_TENANT_ID)),
  );
}

export function getRepository(): Promise<Repository> {
  if (!cached) cached = createRepository();
  return cached;
}

/** Drops the cached instance. For tests and hot reload only. */
export function resetRepository(): void {
  cached = null;
}
