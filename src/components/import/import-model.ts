import { providerById, type IntegrationProvider } from "@/domain/integrations";
import { OAUTH_CRM_SOURCES } from "@/domain/crmSync";
import { PRESETS, TARGET_FIELDS, type ColumnMapping, type MappingPlan, type RowIssue, type SourcePreset, type TargetField } from "@/domain/migration";
import { GOHIGHLEVEL_CSV, HUBSPOT_CSV, MESSY_CSV } from "@/fixtures/migration";

/** The four steps. Only the current step word is shown. */
export type Step = 1 | 2 | 3 | 4;
export const STEP_WORD: Record<Step, string> = { 1: "Bring your data", 2: "We matched", 3: "Check", 4: "Done" };

export const IGNORE: TargetField = "ignore";

export interface CrmSource {
  provider: IntegrationProvider;
  preset: SourcePreset;
}

/** OAuth CRMs in tile order. Close and Pipedrive have no Simple Icons mark, the tile falls back to a letter. */
export const CRM_SOURCES: CrmSource[] = OAUTH_CRM_SOURCES.flatMap(({ providerId, preset }) => {
  const provider = providerById[providerId];
  return provider ? [{ provider, preset }] : [];
});

/**
 * What the simulated sync hands back for a preset. HubSpot and GoHighLevel
 * have exact sample exports; the others stand in with the messy sheet.
 */
export function simulatedCsv(preset: SourcePreset): string {
  if (preset === "hubspot") return HUBSPOT_CSV;
  if (preset === "gohighlevel") return GOHIGHLEVEL_CSV;
  return MESSY_CSV;
}

const BRAND: Partial<Record<SourcePreset, string>> = { google_sheets: "#34A853", generic: "#34A853" };

/** IntegrationProvider for a preset so LogoTile can paint its mark. Registry providers are used as-is. */
export function presetProvider(preset: SourcePreset): IntegrationProvider {
  const hit = CRM_SOURCES.find((s) => s.preset === preset);
  if (hit) return hit.provider;
  const spec = PRESETS[preset];
  return {
    providerId: `import_${preset}`,
    name: spec.label,
    category: "other",
    logoSlug: spec.logoSlug,
    brandColor: BRAND[preset] ?? "#34A853",
    auth: "none",
    feeds: [],
    entryPathDefault: "form_entry",
    permissions: [],
    setup: [],
    oneLiner: "",
  };
}

/** Target field label by field id. "ignore" reads "Ignore". */
export function targetLabel(target: TargetField): string {
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
  fields: { field: TargetField; label: string }[];
}

/** TARGET_FIELDS grouped by entity for a select, in first-seen order. Ignore is its own option. */
export function targetGroups(): TargetGroup[] {
  const out: TargetGroup[] = [];
  for (const f of TARGET_FIELDS) {
    if (f.field === IGNORE) continue;
    let g = out.find((x) => x.entity === f.entity);
    if (!g) {
      g = { entity: f.entity, label: ENTITY_LABEL[f.entity] ?? f.entity, fields: [] };
      out.push(g);
    }
    g.fields.push({ field: f.field, label: f.label });
  }
  return out;
}

export function reviewHeaders(plan: MappingPlan): Set<string> {
  return new Set(plan.needsReview.map((c) => c.header));
}

/** What the review select starts on: the current target, else the best alternative, else Ignore. */
export function bestAlternative(c: ColumnMapping): TargetField {
  if (c.target !== IGNORE) return c.target;
  return c.alternatives.find((a) => a !== IGNORE) ?? IGNORE;
}

export function confidencePercent(c: ColumnMapping): string {
  return `${Math.round(Math.max(0, Math.min(1, c.confidence)) * 100)}%`;
}

export type Severity = RowIssue["severity"];

export const SEVERITY_ORDER: Severity[] = ["error", "warning"];
export const SEVERITY_LABEL: Record<Severity, string> = { error: "Skipped", warning: "Check" };

/** Distinct data rows carrying an error. These are the rows the import skips. */
export function errorRows(issues: RowIssue[]): number {
  return new Set(issues.filter((i) => i.severity === "error").map((i) => i.row)).size;
}

/** Spreadsheet line for a 0-based data row, counting the header as line 1. */
export function lineOf(row: number): number {
  return row + 2;
}
