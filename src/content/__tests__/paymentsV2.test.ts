/**
 * The guard on the acceptance registry.
 *
 * A checklist that grades itself is worthless. These tests read the repository
 * from disk and make a false coverage claim fail `npm test`:
 *
 *  - the numbers run 1 to 62 with no gap and no duplicate;
 *  - every row that claims `implemented_and_tested` names at least one test
 *    title that is actually present in a test file on disk;
 *  - no row naming Whop or Toast may claim it, whatever a provider-neutral test
 *    elsewhere happens to prove;
 *  - no row whose evidence would need a provider credential may claim it,
 *    because this repository holds none;
 *  - docs/PAYMENTS_SCENARIOS.md is the rendered registry, byte for byte.
 *
 * It is modelled on the numbered registry at
 * src/content/frameworks/personalMeaningListener.ts, which is asserted the same
 * way by src/domain/__tests__/references.test.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_SCENARIOS,
  SCENARIO_COUNT,
  SCENARIO_PHASES,
  SCENARIO_STATUSES,
  UNPROVEN_PROVIDERS,
  namesUnprovenProvider,
  phaseDescriptor,
  renderScenariosDoc,
  scenario,
  scenarioTally,
  scenariosByPhase,
  statusDescriptor,
  type AcceptanceScenario,
} from "@/content/acceptance";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Every `*.test.ts` file in the repository, repository-relative. */
function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...testFiles(full));
      continue;
    }
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) out.push(relative(ROOT, full));
  }
  return out;
}

const TEST_FILES = testFiles(SRC);
const SOURCE_BY_FILE = new Map<string, string>(TEST_FILES.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));

/**
 * Every `it(...)` title in the suite, by file. Titles are matched as exact
 * strings, not as regular expressions, so a near miss is a failure.
 */
const TITLES_BY_FILE = new Map<string, Set<string>>();
for (const [file, source] of SOURCE_BY_FILE) {
  const titles = new Set<string>();
  const re = /\bit(?:\.each\([^)]*\))?\(\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) titles.add(JSON.parse(`"${m[1]}"`));
  TITLES_BY_FILE.set(file, titles);
}

const ALL_TITLES = new Set<string>([...TITLES_BY_FILE.values()].flatMap((s) => [...s]));

const implemented = (s: AcceptanceScenario) => s.status === "implemented_and_tested";

describe("the registry harvested the suite's real test titles", () => {
  it("found test files and a plausible number of titles, so a silent zero cannot pass everything", () => {
    expect(TEST_FILES.length).toBeGreaterThan(30);
    expect(ALL_TITLES.size).toBeGreaterThan(400);
  });

  it("harvests a known title exactly, and rejects one that only nearly matches", () => {
    expect(ALL_TITLES.has("a payment delivered three times affects the ledger once (T01/T37)")).toBe(true);
    expect(ALL_TITLES.has("a payment delivered three times affects the ledger once")).toBe(false);
    expect(ALL_TITLES.has("a test that does not exist anywhere in this repository")).toBe(false);
  });
});

describe("1 to 62, with no gap and no duplicate", () => {
  it("carries exactly 62 scenarios, numbered 1 to 62 in order", () => {
    expect(ACCEPTANCE_SCENARIOS).toHaveLength(SCENARIO_COUNT);
    expect(ACCEPTANCE_SCENARIOS.map((s) => s.n)).toEqual(Array.from({ length: SCENARIO_COUNT }, (_, i) => i + 1));
  });

  it("gives every scenario a unique PV2 id, namespaced away from the existing T01 to T56 register", () => {
    const ids = ACCEPTANCE_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(SCENARIO_COUNT);
    for (const s of ACCEPTANCE_SCENARIOS) {
      expect(s.id).toBe(`PV2-${String(s.n).padStart(2, "0")}`);
    }
    expect(ids.some((id) => /^T\d\d$/.test(id))).toBe(false);
  });

  it("carries non-empty scenario text that ends in a full stop and repeats no scenario", () => {
    const texts = ACCEPTANCE_SCENARIOS.map((s) => s.text);
    expect(new Set(texts).size).toBe(SCENARIO_COUNT);
    for (const s of ACCEPTANCE_SCENARIOS) {
      expect(s.text.length).toBeGreaterThan(20);
      expect(s.text.endsWith(".")).toBe(true);
      expect(s.text.trim()).toBe(s.text);
    }
  });

  it("looks a scenario up by number and refuses one that does not exist", () => {
    expect(scenario(5).id).toBe("PV2-05");
    expect(() => scenario(63)).toThrow(/No acceptance scenario numbered 63/);
    expect(() => scenario(0)).toThrow();
  });
});

describe("every phase and status is a declared one, with a label and an icon", () => {
  it("assigns every scenario to one of the six phases, and leaves no phase empty", () => {
    const declared = new Set(SCENARIO_PHASES.map((p) => p.phase));
    expect(declared.size).toBe(6);
    for (const s of ACCEPTANCE_SCENARIOS) expect(declared.has(s.phase)).toBe(true);
    for (const p of SCENARIO_PHASES) expect(scenariosByPhase(p.phase).length).toBeGreaterThan(0);
  });

  it("groups all 62 exactly once across the phases", () => {
    const grouped = SCENARIO_PHASES.flatMap((p) => scenariosByPhase(p.phase).map((s) => s.n));
    expect(grouped.length).toBe(SCENARIO_COUNT);
    expect(new Set(grouped).size).toBe(SCENARIO_COUNT);
  });

  it("uses exactly the six fixed status words and no seventh, and has no partial", () => {
    expect(SCENARIO_STATUSES.map((s) => s.status)).toEqual([
      "implemented_and_tested",
      "mocked",
      "blocked_by_access",
      "awaiting_provider_review",
      "not_tested",
      "absent",
    ]);
    const declared = new Set(SCENARIO_STATUSES.map((s) => s.status));
    for (const s of ACCEPTANCE_SCENARIOS) expect(declared.has(s.status)).toBe(true);
  });

  it("gives every phase and every status a text label and an icon, so no state is carried by colour alone", () => {
    for (const p of SCENARIO_PHASES) {
      expect(phaseDescriptor(p.phase)).toBe(p);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.icon).toMatch(/^[A-Z][A-Za-z]+$/);
      expect(p.summary.length).toBeGreaterThan(0);
    }
    for (const d of SCENARIO_STATUSES) {
      expect(statusDescriptor(d.status)).toBe(d);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.icon).toMatch(/^[A-Z][A-Za-z]+$/);
      expect(d.meaning.length).toBeGreaterThan(0);
    }
    expect(() => phaseDescriptor("nope" as never)).toThrow();
    expect(() => statusDescriptor("partial" as never)).toThrow();
  });

  it("uses no em dash and no en dash in any string a person reads", () => {
    for (const s of ACCEPTANCE_SCENARIOS) {
      expect(s.text).not.toMatch(/[—–]/);
      expect(s.notes).not.toMatch(/[—–]/);
    }
    for (const p of SCENARIO_PHASES) {
      expect(`${p.label} ${p.summary}`).not.toMatch(/[—–]/);
    }
    for (const d of SCENARIO_STATUSES) {
      expect(`${d.label} ${d.meaning}`).not.toMatch(/[—–]/);
    }
    expect(renderScenariosDoc()).not.toMatch(/[—–]/);
  });
});

describe("a claim of test coverage must name a test that exists", () => {
  it("gives every implemented_and_tested row at least one covering test, and every other row none", () => {
    for (const s of ACCEPTANCE_SCENARIOS) {
      if (implemented(s)) {
        expect(s.coveredBy.length, `${s.id} claims coverage and names no test`).toBeGreaterThan(0);
      } else {
        expect(s.coveredBy, `${s.id} is ${s.status} and may not name a proving test`).toEqual([]);
      }
    }
  });

  it("names a test file that exists, in a repository-relative path under src", () => {
    for (const s of ACCEPTANCE_SCENARIOS) {
      for (const ref of s.coveredBy) {
        expect(ref.file.startsWith("src/"), `${s.id}: ${ref.file} is not under src/`).toBe(true);
        expect(SOURCE_BY_FILE.has(ref.file), `${s.id}: no such test file ${ref.file}`).toBe(true);
      }
    }
  });

  it("names a test title that is actually present in that exact file", () => {
    for (const s of ACCEPTANCE_SCENARIOS) {
      for (const ref of s.coveredBy) {
        const titles = TITLES_BY_FILE.get(ref.file);
        expect(titles, `${s.id}: no titles harvested from ${ref.file}`).toBeDefined();
        expect(
          titles?.has(ref.title),
          `${s.id} cites a test that does not exist: ${ref.file} has no it("${ref.title}")`,
        ).toBe(true);
      }
    }
  });

  it("repeats no covering test within one scenario", () => {
    for (const s of ACCEPTANCE_SCENARIOS) {
      const keys = s.coveredBy.map((r) => `${r.file}::${r.title}`);
      expect(new Set(keys).size, `${s.id} cites the same test twice`).toBe(keys.length);
    }
  });
});

describe("two rules cap a grade regardless of what a test proves", () => {
  it("lets no Whop or Toast row read implemented_and_tested", () => {
    const offenders = ACCEPTANCE_SCENARIOS.filter((s) => namesUnprovenProvider(s) && implemented(s));
    expect(offenders.map((s) => s.id)).toEqual([]);
  });

  it("recognises a Whop or Toast row by its phase and by its text", () => {
    expect(UNPROVEN_PROVIDERS).toEqual(["Whop", "Toast"]);
    // Scenario 36 sits in Step C by phase and still names Whop in its text.
    expect(scenario(36).phase).toBe("step_c_payment_requests");
    expect(namesUnprovenProvider(scenario(36))).toBe(true);
    expect(namesUnprovenProvider(scenario(28))).toBe(true);
    expect(namesUnprovenProvider(scenario(40))).toBe(true);
    expect(namesUnprovenProvider(scenario(41))).toBe(true);
    expect(namesUnprovenProvider(scenario(4))).toBe(false);
  });

  it("holds every Whop and Toast row at blocked_by_access or below, because no grant exists", () => {
    for (const s of ACCEPTANCE_SCENARIOS.filter(namesUnprovenProvider)) {
      expect(["blocked_by_access", "awaiting_provider_review", "not_tested", "absent", "mocked"]).toContain(s.status);
    }
  });

  it("lets no row read implemented_and_tested when its evidence would need a provider credential", () => {
    const offenders = ACCEPTANCE_SCENARIOS.filter((s) => s.evidenceNeedsProviderCredential && implemented(s));
    expect(offenders.map((s) => s.id)).toEqual([]);
  });

  it("marks every Whop and Toast row as needing a credential, and records why for each such row", () => {
    for (const s of ACCEPTANCE_SCENARIOS.filter(namesUnprovenProvider)) {
      expect(s.evidenceNeedsProviderCredential, `${s.id} names an unproven provider and claims no credential is needed`).toBe(true);
    }
    for (const s of ACCEPTANCE_SCENARIOS.filter((x) => x.evidenceNeedsProviderCredential)) {
      expect(s.notes.length, `${s.id} needs a credential and says nothing about why`).toBeGreaterThan(40);
    }
  });

  it("says what is missing on every row that is not proven, so no row is silently blank", () => {
    for (const s of ACCEPTANCE_SCENARIOS.filter((x) => !implemented(x))) {
      expect(s.notes.length, `${s.id} is ${s.status} and explains nothing`).toBeGreaterThan(40);
    }
  });
});

describe("the tally is computed, never asserted by hand", () => {
  it("sums to 62 across the six statuses", () => {
    const tally = scenarioTally();
    const sum = Object.values(tally).reduce((a, b) => a + b, 0);
    expect(sum).toBe(SCENARIO_COUNT);
    expect(tally.implemented_and_tested + tally.not_tested + tally.absent + tally.blocked_by_access).toBe(SCENARIO_COUNT);
  });

  it("claims nothing is mocked or awaiting provider review, because no provider connection exists to mock or to submit", () => {
    const tally = scenarioTally();
    expect(tally.mocked).toBe(0);
    expect(tally.awaiting_provider_review).toBe(0);
  });

  it("has risen above the audit's starting tally of 3 proven scenarios without claiming everything", () => {
    const tally = scenarioTally();
    expect(tally.implemented_and_tested).toBeGreaterThan(3);
    expect(tally.implemented_and_tested).toBeLessThan(SCENARIO_COUNT);
    // The connection, provider and server halves are genuinely not built.
    expect(tally.absent + tally.not_tested + tally.blocked_by_access).toBeGreaterThan(20);
  });

  it("tallies a subset as readily as the whole register", () => {
    const toast = scenariosByPhase("step_e_toast");
    expect(scenarioTally(toast).blocked_by_access).toBe(toast.length);
    expect(scenarioTally([])).toMatchObject({ implemented_and_tested: 0, absent: 0 });
  });
});

describe("docs/PAYMENTS_SCENARIOS.md is the registry, rendered", () => {
  it("matches renderScenariosDoc byte for byte, so the document cannot drift from the data", () => {
    const onDisk = readFileSync(join(ROOT, "docs", "PAYMENTS_SCENARIOS.md"), "utf8");
    expect(onDisk).toBe(renderScenariosDoc());
  });

  it("prints every scenario number, id and status, grouped under its phase heading", () => {
    const doc = renderScenariosDoc();
    for (const p of SCENARIO_PHASES) expect(doc).toContain(`## ${p.label}`);
    for (const s of ACCEPTANCE_SCENARIOS) {
      expect(doc).toContain(s.id);
      expect(doc).toContain(s.text);
      expect(doc).toContain(`\`${s.status}\``);
    }
  });

  it("states in the document that no provider was contacted and no credential was used", () => {
    const doc = renderScenariosDoc();
    expect(doc).toMatch(/No provider was contacted, no credential was used/);
    expect(doc).toMatch(/synthetic/i);
  });
});
