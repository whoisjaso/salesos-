import type { IntegrationProvider } from "@/domain/integrations";
import { PRESETS, TARGET_FIELDS, type ColumnMapping, type MappingPlan, type RowIssue, type SourcePreset } from "@/domain/migration";
import * as migrationFixtures from "@/fixtures/migration";

/** The four steps. Only the current step word is shown. */
export type Step = 1 | 2 | 3 | 4;
export const STEP_WORD: Record<Step, string> = { 1: "Bring your data", 2: "We matched", 3: "Check", 4: "Done" };

/** Presets with a sample file, in tile order. Close and Pipedrive have no Simple Icons mark, the tile falls back to a letter. */
export const PRESET_TILES: SourcePreset[] = ["hubspot", "gohighlevel", "salesforce", "pipedrive", "zoho", "close", "google_sheets"];

const BRAND: Record<SourcePreset, string> = {
  hubspot: "#FF7A59",
  gohighlevel: "#2C7BE5",
  salesforce: "#00A1E0",
  pipedrive: "#017737",
  zoho: "#E42527",
  close: "#2F6BFF",
  google_sheets: "#34A853",
  generic: "#34A853",
};

/** Minimal IntegrationProvider so LogoTile can paint a preset mark. Nothing else reads it. */
export function presetProvider(preset: SourcePreset): IntegrationProvider {
  const spec = PRESETS[preset];
  return {
    providerId: `import_${preset}`,
    name: spec.label,
    category: "crm",
    logoSlug: spec.logoSlug,
    brandColor: BRAND[preset],
    auth: "none",
    feeds: [],
    entryPathDefault: "form_entry",
    permissions: [],
    setup: [],
    oneLiner: "",
  };
}

const SAMPLE_KEY: Record<SourcePreset, string> = {
  hubspot: "hubspotCsv",
  gohighlevel: "gohighlevelCsv",
  salesforce: "salesforceCsv",
  pipedrive: "pipedriveCsv",
  zoho: "zohoCsv",
  close: "closeCsv",
  google_sheets: "googleSheetsCsv",
  generic: "messySheetCsv",
};

/** Sample CSV text for a preset, or null when the fixtures do not carry one. */
export function sampleCsv(preset: SourcePreset): string | null {
  const bag = migrationFixtures as Record<string, unknown>;
  const v = bag[SAMPLE_KEY[preset]];
  return typeof v === "string" ? v : null;
}

export function sampleLabel(preset: SourcePreset): string {
  return `Sample: ${PRESETS[preset].label} export`;
}

/** Target field label by field id. Unknown or empty reads "Ignore". */
export function targetLabel(target: string | null | undefined): string {
  if (!target) return "Ignore";
  return TARGET_FIELDS.find((f) => f.field === target)?.label ?? target;
}

export const ENTITY_LABEL: Record<string, string> = {
  contact: "People",
  opportunity: "Deals",
  appointment: "Appointments",
  payment: "Payments",
  note: "Notes",
};

export interface TargetGroup {
  entity: string;
  label: string;
  fields: { field: string; label: string }[];
}

/** TARGET_FIELDS grouped by entity for a select, in first-seen order. */
export function targetGroups(): TargetGroup[] {
  const out: TargetGroup[] = [];
  for (const f of TARGET_FIELDS) {
    let g = out.find((x) => x.entity === f.entity);
    if (!g) {
      g = { entity: f.entity, label: ENTITY_LABEL[f.entity] ?? f.entity, fields: [] };
      out.push(g);
    }
    g.fields.push({ field: f.field, label: f.label });
  }
  return out;
}

/** Headers the owner should look at: the plan's list, or anything unmapped or under 80 percent. */
export function reviewHeaders(plan: MappingPlan): Set<string> {
  const raw = (plan as { needsReview?: unknown }).needsReview;
  if (Array.isArray(raw)) return new Set(raw.map((x) => (typeof x === "string" ? x : String((x as { header?: string }).header ?? ""))));
  return new Set(plan.columns.filter((c) => !c.target || c.confidence < 0.8).map((c) => c.header));
}

/** Best alternative target for a column, used to preselect the review select. */
export function bestAlternative(c: ColumnMapping): string | null {
  if (c.target) return c.target;
  const first = (c.alternatives as unknown[] | undefined)?.[0];
  if (!first) return null;
  if (typeof first === "string") return first;
  const t = (first as { target?: string | null; field?: string | null }).target ?? (first as { field?: string | null }).field;
  return t ?? null;
}

export function confidencePercent(c: ColumnMapping): string {
  return `${Math.round(Math.max(0, Math.min(1, c.confidence)) * 100)}%`;
}

export type Severity = "error" | "warning" | "info";

export interface IssueRow {
  row: number;
  header: string;
  problem: string;
  value: string;
  severity: Severity;
}

/** One shape for the issue list regardless of the engine's field names. */
export function issueRow(i: RowIssue): IssueRow {
  const r = i as unknown as Record<string, unknown>;
  const sev = String(r.severity ?? r.level ?? "warning");
  return {
    row: Number(r.row ?? r.rowIndex ?? r.line ?? 0),
    header: String(r.header ?? r.column ?? ""),
    problem: String(r.message ?? r.problem ?? r.reason ?? ""),
    value: String(r.value ?? r.raw ?? ""),
    severity: sev === "error" ? "error" : sev === "info" ? "info" : "warning",
  };
}

export const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];
export const SEVERITY_LABEL: Record<Severity, string> = { error: "Skipped", warning: "Check", info: "Note" };
