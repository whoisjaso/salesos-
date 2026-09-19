import { describe, expect, it } from "vitest";
import { PILOT_BENCHMARKS, defaultBenchmarkFor, evaluate } from "@/domain/performance";
import { buildPayload } from "@/domain/metrics";
import type { MetricPayload } from "@/domain/types";

function ratio(numerator: number, denominator: number, extra: Partial<MetricPayload> = {}): MetricPayload {
  const p = buildPayload({ metricId: "M08", label: "Show rate", numerator, denominator, unit: "ratio", cohortId: "c", timeBasis: "t", asOf: "2026-09-18T20:00:00Z" });
  return { ...p, ...extra };
}

describe("performance verdicts (SOS-20)", () => {
  const m08 = defaultBenchmarkFor("M08");

  it("neutral when no benchmark, with a text label", () => {
    const v = evaluate(ratio(40, 50));
    expect(v.state).toBe("neutral_no_benchmark");
    expect(v.label).toBe("No benchmark");
    expect(v.explanation).toMatch(/40 \/ 50/);
  });

  it("provisional when the denominator is below the minimum sample", () => {
    const v = evaluate(ratio(4, 5), m08);
    expect(v.state).toBe("provisional_small_sample");
    expect(v.label).toMatch(/Provisional/);
  });

  it("data_state when the metric is not complete, with bounds explained", () => {
    const v = evaluate(ratio(30, 50, { dataState: "partial", unknownCount: 5, bounds: { lower: 0.6, upper: 0.7 } }), m08);
    expect(v.state).toBe("data_state");
    expect(v.label).toBe("Data state: partial");
    expect(v.explanation).toMatch(/lower bound 60.0%/);
  });

  it("contextual direction never colors", () => {
    const v = evaluate(ratio(10, 40), defaultBenchmarkFor("M09"));
    expect(v.state).toBe("neutral_no_benchmark");
    expect(v.label).toBe("Contextual");
  });

  it("strong / attention / material_issue by target and attention band", () => {
    expect(evaluate(ratio(40, 50), m08).state).toBe("strong"); // 80% >= 70%
    expect(evaluate(ratio(30, 50), m08).state).toBe("attention"); // 60%, within 15pt band
    expect(evaluate(ratio(20, 50), m08).state).toBe("material_issue"); // 40%
    const material = evaluate(ratio(20, 50), m08);
    expect(material.label).toBe("Material issue");
    expect(material.explanation).toMatch(/before attributing this to a person/);
  });

  it("pilot benchmarks are labeled pilot_hypothesis and cover the requested metrics", () => {
    for (const b of PILOT_BENCHMARKS) expect(b.origin).toBe("pilot_hypothesis");
    expect(PILOT_BENCHMARKS.map((b) => b.metricId).sort()).toEqual(["M04", "M06", "M08", "M09", "M11", "M12"]);
    expect(defaultBenchmarkFor("M09")?.favorableDirection).toBe("contextual");
  });
});
