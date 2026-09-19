import { describe, expect, it, vi } from "vitest";
import {
  connectAndPull,
  OAUTH_CRM_SOURCES,
  pullAll,
  simulatedCrmSync,
  type CrmSyncAdapter,
  type SyncObject,
  type SyncProgress,
} from "@/domain/crmSync";
import { PROVIDERS, providerById, SimulatedAuthorizer, type AuthorizeRequest } from "@/domain/integrations";
import { detectPreset, dryRun, parseCsv, profileColumns, suggestMapping, type ImportContext } from "@/domain/migration";
import { GOHIGHLEVEL_CSV, HUBSPOT_CSV, MESSY_CSV, MIGRATION_NOW, MIGRATION_TENANT, migrationUsers } from "@/fixtures/migration";

const ALL_OBJECTS: SyncObject[] = ["contacts", "deals", "appointments", "payments", "notes"];

function request(providerId = "hubspot"): AuthorizeRequest {
  return { tenantId: MIGRATION_TENANT, providerId, redirectUri: "https://app.example.com/oauth/callback", state: "csrf_123" };
}

function ctx(): ImportContext {
  return { tenantId: MIGRATION_TENANT, now: MIGRATION_NOW, existingContacts: [], users: migrationUsers };
}

describe("simulatedCrmSync", () => {
  const parsed = parseCsv(HUBSPOT_CSV);

  it("exposes every sync object and the simulated authorizer", () => {
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    expect(adapter.preset).toBe("hubspot");
    expect(adapter.authorizer).toBe(SimulatedAuthorizer);
    expect(adapter.supports()).toEqual(ALL_OBJECTS);
  });

  it("pages through all contact rows with pageSize 3", async () => {
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = await adapter.pull("contacts", cursor);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor);

    expect(parsed.rows).toHaveLength(10);
    expect(pages).toHaveLength(4);
    expect(pages.map((p) => p.rows.length)).toEqual([3, 3, 3, 1]);
    expect(pages.map((p) => p.nextCursor)).toEqual(["3", "6", "9", undefined]);
    for (const p of pages) {
      expect(p.object).toBe("contacts");
      expect(p.headers).toEqual(parsed.headers);
    }
    expect(pages.flatMap((p) => p.rows)).toEqual(parsed.rows);
  });

  it("returns one page with no cursor when pageSize covers the file", async () => {
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 50);
    const page = await adapter.pull("contacts");
    expect(page.rows).toEqual(parsed.rows);
    expect(page.nextCursor).toBeUndefined();
  });

  it("returns an empty page with headers for objects other than contacts", async () => {
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    for (const object of ALL_OBJECTS.filter((o) => o !== "contacts")) {
      const page = await adapter.pull(object);
      expect(page).toEqual({ object, headers: parsed.headers, rows: [] });
    }
  });
});

describe("pullAll", () => {
  it("reassembles every row in order with the correct pagesPulled", async () => {
    const parsed = parseCsv(HUBSPOT_CSV);
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const result = await pullAll(adapter, { objects: ["contacts"] });
    expect(result.preset).toBe("hubspot");
    expect(result.headers).toEqual(parsed.headers);
    expect(result.rows).toEqual(parsed.rows);
    expect(result.objects).toEqual(["contacts"]);
    expect(result.pagesPulled).toBe(4);
  });

  it("counts one page per non-contact object and does not duplicate rows", async () => {
    const parsed = parseCsv(GOHIGHLEVEL_CSV);
    const adapter = simulatedCrmSync("gohighlevel", GOHIGHLEVEL_CSV, 3);
    const result = await pullAll(adapter, { objects: ALL_OBJECTS });
    expect(result.rows).toEqual(parsed.rows);
    expect(result.objects).toEqual(ALL_OBJECTS);
    // 4 contact pages + 1 empty page for each of the 4 other objects.
    expect(result.pagesPulled).toBe(8);
  });

  it("calls onProgress for each page with done true only on the last page", async () => {
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const onProgress = vi.fn<(p: SyncProgress) => void>();
    await pullAll(adapter, { objects: ["contacts"] }, onProgress);
    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
      { object: "contacts", fetched: 3, done: false },
      { object: "contacts", fetched: 6, done: false },
      { object: "contacts", fetched: 9, done: false },
      { object: "contacts", fetched: 10, done: true },
    ]);
  });

  it("skips objects the adapter does not support", async () => {
    const parsed = parseCsv(HUBSPOT_CSV);
    const base = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const pull = vi.fn(base.pull);
    const adapter: CrmSyncAdapter = { ...base, supports: () => ["contacts"], pull };
    const onProgress = vi.fn<(p: SyncProgress) => void>();
    const result = await pullAll(adapter, { objects: ["deals", "contacts", "notes"] }, onProgress);
    expect(result.objects).toEqual(["contacts"]);
    expect(result.rows).toEqual(parsed.rows);
    expect(result.pagesPulled).toBe(4);
    expect(pull.mock.calls.every(([object]) => object === "contacts")).toBe(true);
    expect(onProgress.mock.calls.every(([p]) => p.object === "contacts")).toBe(true);
  });

  it("returns an empty table when nothing requested is supported", async () => {
    const base = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const adapter: CrmSyncAdapter = { ...base, supports: () => [] };
    const result = await pullAll(adapter, { objects: ALL_OBJECTS });
    expect(result).toEqual({ preset: "hubspot", headers: [], rows: [], objects: [], pagesPulled: 0 });
  });
});

describe("connectAndPull", () => {
  it("returns auth.ok false and pulls nothing with a bad code", async () => {
    const base = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const pull = vi.fn(base.pull);
    const adapter: CrmSyncAdapter = { ...base, pull };
    const onProgress = vi.fn<(p: SyncProgress) => void>();
    const result = await connectAndPull({ adapter, request: request(), code: "bogus", scope: { objects: ["contacts"] }, onProgress });
    expect(result.auth.ok).toBe(false);
    expect(result.auth.error).toBe("Invalid code");
    expect(result.sync).toBeUndefined();
    expect(pull).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("returns auth.ok false for an unknown provider", async () => {
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const result = await connectAndPull({ adapter, request: request("nope"), code: "simulated_nope", scope: { objects: ["contacts"] } });
    expect(result.auth).toEqual({ ok: false, error: "Unknown provider" });
    expect(result.sync).toBeUndefined();
  });

  it("returns the full table with a good code", async () => {
    const parsed = parseCsv(HUBSPOT_CSV);
    const adapter = simulatedCrmSync("hubspot", HUBSPOT_CSV, 3);
    const req = request("hubspot");
    const code = new URL(adapter.authorizer.begin(req).url).searchParams.get("code")!;
    expect(code).toBe("simulated_hubspot");
    const onProgress = vi.fn<(p: SyncProgress) => void>();
    const result = await connectAndPull({ adapter, request: req, code, scope: { objects: ["contacts"] }, onProgress });
    expect(result.auth.ok).toBe(true);
    expect(result.auth.accountLabel).toBe("HubSpot account");
    expect(result.auth.grantedPermissions).toEqual(providerById.hubspot.permissions);
    expect(result.sync).toEqual({ preset: "hubspot", headers: parsed.headers, rows: parsed.rows, objects: ["contacts"], pagesPulled: 4 });
    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(onProgress.mock.lastCall?.[0]).toEqual({ object: "contacts", fetched: 10, done: true });
  });
});

describe("OAuth path is equivalent to the file path", () => {
  async function pulled(preset: "hubspot" | "gohighlevel" | "generic", csv: string) {
    const adapter = simulatedCrmSync(preset, csv, 3);
    const result = await connectAndPull({
      adapter,
      request: request("hubspot"),
      code: "simulated_hubspot",
      scope: { objects: ALL_OBJECTS },
    });
    expect(result.auth.ok).toBe(true);
    return result.sync!;
  }

  it("detects hubspot from the pulled headers", async () => {
    const sync = await pulled("hubspot", HUBSPOT_CSV);
    const fromSync = detectPreset(sync.headers);
    expect(fromSync.preset).toBe("hubspot");
    expect(fromSync).toEqual(detectPreset(parseCsv(HUBSPOT_CSV).headers));
  });

  it("detects gohighlevel from the pulled headers", async () => {
    const sync = await pulled("gohighlevel", GOHIGHLEVEL_CSV);
    expect(detectPreset(sync.headers).preset).toBe("gohighlevel");
  });

  it("suggests the same mapping coverage from pulled data as from parseCsv", async () => {
    for (const [preset, csv] of [
      ["hubspot", HUBSPOT_CSV],
      ["gohighlevel", GOHIGHLEVEL_CSV],
      ["generic", MESSY_CSV],
    ] as const) {
      const sync = await pulled(preset, csv);
      const file = parseCsv(csv);
      const fromSync = suggestMapping(profileColumns(sync.headers, sync.rows));
      const fromFile = suggestMapping(profileColumns(file.headers, file.rows));
      expect(fromSync.preset).toBe(fromFile.preset);
      expect(fromSync.mappedCount).toBe(fromFile.mappedCount);
      expect(fromSync.totalColumns).toBe(fromFile.totalColumns);
      expect(fromSync.needsReview).toEqual(fromFile.needsReview);
      expect(fromSync.columns).toEqual(fromFile.columns);
    }
  });

  it("produces the same dry-run report over pulled rows as over the parsed CSV", async () => {
    for (const [preset, csv] of [
      ["hubspot", HUBSPOT_CSV],
      ["gohighlevel", GOHIGHLEVEL_CSV],
      ["generic", MESSY_CSV],
    ] as const) {
      const sync = await pulled(preset, csv);
      const file = parseCsv(csv);
      const syncPlan = suggestMapping(profileColumns(sync.headers, sync.rows));
      const filePlan = suggestMapping(profileColumns(file.headers, file.rows));
      const fromSync = dryRun(syncPlan, sync.headers, sync.rows, ctx());
      const fromFile = dryRun(filePlan, file.headers, file.rows, ctx());
      expect(fromSync).toEqual(fromFile);
      expect(fromSync.rows).toBe(file.rows.length);
      expect(fromSync.rows).toBeGreaterThan(0);
    }
  });
});

describe("OAUTH_CRM_SOURCES", () => {
  it("lists only OAuth CRM providers from the registry", () => {
    expect(OAUTH_CRM_SOURCES.length).toBeGreaterThan(0);
    for (const src of OAUTH_CRM_SOURCES) {
      const provider = PROVIDERS.find((p) => p.providerId === src.providerId);
      expect(provider, `provider ${src.providerId}`).toBeDefined();
      expect(provider!.auth).toBe("oauth");
      expect(provider!.category).toBe("crm");
    }
  });

  it("covers every OAuth CRM in the registry exactly once", () => {
    const ids = OAUTH_CRM_SOURCES.map((s) => s.providerId);
    expect(new Set(ids).size).toBe(ids.length);
    const oauthCrms = PROVIDERS.filter((p) => p.category === "crm" && p.auth === "oauth").map((p) => p.providerId);
    expect([...ids].sort()).toEqual([...oauthCrms].sort());
  });

  it("maps each source to a preset named after its provider", () => {
    for (const src of OAUTH_CRM_SOURCES) expect(src.preset).toBe(src.providerId);
  });
});
