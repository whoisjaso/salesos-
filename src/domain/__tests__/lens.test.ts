import { describe, expect, it } from "vitest";
import { buildSystemPrompt, defaultLensPack, LENS_PACK_VERSION, SCHEMA_INSTRUCTION, STAGE_INSTRUCTION, type LensPack } from "@/domain/lens";
import { lenses, adaptationBoundaries } from "@/content/lenses";
import { frameworks } from "@/content/lens/frameworks";

describe("defaultLensPack", () => {
  it("composes the twelve archetypes, the adaptation boundaries, offer facts, and the content frameworks", () => {
    const pack = defaultLensPack();
    expect(pack.version).toBe(LENS_PACK_VERSION);
    expect(pack.archetypes).toHaveLength(12);
    expect(pack.archetypes).toBe(lenses);
    expect(pack.salesFrameworks).toBe(frameworks);
    expect(pack.offerFacts.length).toBeGreaterThan(0);
    for (const never of adaptationBoundaries.neverAdapts) expect(pack.doNots.join("\n").toLowerCase()).toContain(never.toLowerCase());
    // No price the model could move.
    expect(pack.offerFacts.join("\n")).not.toMatch(/\$\s?\d|4,?800/);
  });
});

describe("buildSystemPrompt", () => {
  const pack = defaultLensPack();
  const prompt = buildSystemPrompt(pack);

  it("names every archetype with its evidence and its do-not", () => {
    for (const a of pack.archetypes) {
      expect(prompt).toContain(a.label);
      expect(prompt).toContain(a.name);
      expect(prompt).toContain(a.evidenceToLookFor);
      expect(prompt).toContain(a.doNot);
    }
  });

  it("carries every do-not, every offer fact, and the schema and stage instructions", () => {
    for (const d of pack.doNots) expect(prompt).toContain(d);
    for (const f of pack.offerFacts) expect(prompt).toContain(f);
    expect(prompt).toContain(SCHEMA_INSTRUCTION);
    expect(prompt).toContain(STAGE_INSTRUCTION);
    expect(prompt).toMatch(/at most three angles/i);
    expect(prompt).toMatch(/customer's own words/);
    expect(prompt).toMatch(/Never invent a price, a discount, consent, payment, or attendance/);
    expect(prompt).toMatch(/Output JSON only/);
    expect(prompt).not.toContain("(none configured)");
    expect(prompt).toContain("Impact Formula");
  });

  it("prints frameworks with their principles and do-nots when the owner adds them", () => {
    const withFramework: LensPack = {
      ...pack,
      salesFrameworks: [{ name: "Owner framework", source: "owner notes", principles: ["Ask before you tell"], doNots: ["Never rush the close"] }],
    };
    const p = buildSystemPrompt(withFramework);
    expect(p).toContain("Owner framework (source: owner notes)");
    expect(p).toContain("Ask before you tell");
    expect(p).toContain("Never rush the close");
    expect(p).not.toContain("(none configured)");
  });

  it("is deterministic", () => {
    expect(buildSystemPrompt(defaultLensPack())).toBe(prompt);
    expect(buildSystemPrompt(structuredClone(pack))).toBe(prompt);
  });
});
