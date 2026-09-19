/**
 * Corrected source-reproduction sheet (SOS-01), August 2026.
 *
 * Provenance: visual reading of docs/spec/assets/IMG_4629.png. Not a native
 * spreadsheet export. Values must be verified against the original before
 * being used as production records. Revenue is SPEAKER-REPORTED; collection
 * status is unknown. "Calls" in the source means retained calendar bookings.
 */
import type { Money, RevenueBasis } from "@/domain/types";
import { fromDollars } from "@/domain/money";

export interface SourceSheetColumn {
  /** Written label as read from the sheet. The high-volume rep is `rep_high_volume` (label rendering inconsistent in the transcript). */
  repLabel: string;
  displayName: string;
  leadTier: 1 | 2 | 3;
  leads: number;
  /** Labeled "Calls" in the source: calendar bookings retained after pre-call DQ. Not dials or conversations. */
  retainedBookings: number;
  shows: number;
  /** Labeled "Qualified" in the source: rep-perceived fit, not verified eligibility. */
  perceivedQualified: number;
  wins: number;
  reportedRevenue: Money;
  basis: RevenueBasis;
  basisNote: "reported_revenue_basis_unknown";
  provenance: "visual_reading_of_screenshot";
  verified: false;
  anomaly?: string;
}

const col = (
  repLabel: string,
  displayName: string,
  leadTier: 1 | 2 | 3,
  leads: number,
  retainedBookings: number,
  shows: number,
  perceivedQualified: number,
  wins: number,
  revenueDollars: number,
  anomaly?: string,
): SourceSheetColumn => ({
  repLabel,
  displayName,
  leadTier,
  leads,
  retainedBookings,
  shows,
  perceivedQualified,
  wins,
  reportedRevenue: fromDollars(revenueDollars),
  basis: "reported_revenue",
  basisNote: "reported_revenue_basis_unknown",
  provenance: "visual_reading_of_screenshot",
  verified: false,
  anomaly,
});

export const SOURCE_SHEET_HEADER = {
  title: "August 2026",
  capturedAt: "8/31/2026 3:45 PM EST (as printed on the sheet)",
  provenance: "visual_reading_of_screenshot" as const,
  verified: false as const,
  basis: "reported_revenue" as RevenueBasis,
  basisNote: "reported_revenue_basis_unknown" as const,
  columnLabels: {
    leads: "Leads",
    retainedBookings: "Calls (retained calendar bookings, not dials or conversations)",
    shows: "Show",
    perceivedQualified: "Qualified (rep-perceived fit, not verified eligibility)",
    wins: "Won",
    reportedRevenue: "Revenue (speaker-reported; collection status unknown)",
  },
};

const RETAINED_EXCEEDS_LEADS = "retained exceeds leads in source reading";

export const sourceSheetColumns: SourceSheetColumn[] = [
  col("ben", "Ben", 1, 129, 85, 71, 58, 21, 686_000),
  col("brandon", "Brandon", 1, 172, 122, 82, 71, 14, 504_000),
  col("will", "Will", 1, 299, 223, 87, 74, 24, 858_000),
  col("oneil", "O'Neil", 2, 187, 83, 55, 38, 12, 424_000),
  col("gary", "Gary", 2, 193, 100, 51, 36, 13, 396_000),
  col("rep_high_volume", "High-volume rep (written label appears to be Tarun/Taron)", 2, 776, 475, 159, 109, 39, 1_234_000),
  col("miguel", "Miguel", 2, 443, 183, 130, 78, 20, 506_000),
  col("kevin", "Kevin", 3, 170, 156, 58, 30, 3, 102_000),
  col("danyaal", "Danyaal", 3, 236, 141, 70, 33, 3, 108_000),
  col("nathan", "Nathan", 3, 6, 10, 6, 3, 1, 36_000, RETAINED_EXCEEDS_LEADS),
  col("tony", "Tony", 3, 43, 36, 18, 6, 0, 0),
  col("steve", "Steve", 3, 17, 18, 12, 7, 0, 0, RETAINED_EXCEEDS_LEADS),
];

export function sourceColumn(repLabel: string): SourceSheetColumn {
  const found = sourceSheetColumns.find((c) => c.repLabel === repLabel);
  if (!found) throw new Error(`Unknown source column ${repLabel}`);
  return found;
}

export interface DerivedSourceMetrics {
  repLabel: string;
  leadTier: number;
  basis: RevenueBasis;
  /** retained / leads */
  retainedBookingRate: number | null;
  /** 1 - retained / leads. Only equals DQ if every non-retained case was a DQ (SOS-02 M07 caveat). */
  preCallDqComplement: number | null;
  /** shows / retained */
  showRate: number | null;
  /** perceived qualified / shows */
  perceivedQualifiedShowRate: number | null;
  /** wins / perceived qualified */
  winPerPerceivedQualified: number | null;
  /** wins / shows */
  showToWinRate: number | null;
  /** wins / leads */
  leadToWinRate: number | null;
  /** leads / wins; null when zero wins ("N/A: no wins") */
  leadsPerWin: number | null;
  /** reported revenue minor units / leads */
  revenuePerLeadMinor: number | null;
  /** reported revenue minor units / retained bookings */
  revenuePerRetainedBookingMinor: number | null;
  /** reported revenue minor units / wins */
  revenuePerWinMinor: number | null;
  anomaly?: string;
  notes: string[];
}

function div(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

/** SOS-01 recalculated table at full precision. Rounding is a display concern. */
export function deriveSourceMetrics(c: SourceSheetColumn): DerivedSourceMetrics {
  const rev = c.reportedRevenue.amountMinor;
  const notes = [
    "Reported revenue is not collected cash.",
    "Perceived qualified is rep perception, not verified fit.",
    "Retained bookings are calendar bookings, not conversations.",
    "Lead tiers differ across columns; cross-tier comparison is not causal.",
  ];
  if (c.anomaly) notes.push(`Anomaly: ${c.anomaly}; raw values kept as read.`);
  return {
    repLabel: c.repLabel,
    leadTier: c.leadTier,
    basis: c.basis,
    retainedBookingRate: div(c.retainedBookings, c.leads),
    preCallDqComplement: c.leads === 0 ? null : 1 - c.retainedBookings / c.leads,
    showRate: div(c.shows, c.retainedBookings),
    perceivedQualifiedShowRate: div(c.perceivedQualified, c.shows),
    winPerPerceivedQualified: div(c.wins, c.perceivedQualified),
    showToWinRate: div(c.wins, c.shows),
    leadToWinRate: div(c.wins, c.leads),
    leadsPerWin: div(c.leads, c.wins),
    revenuePerLeadMinor: div(rev, c.leads),
    revenuePerRetainedBookingMinor: div(rev, c.retainedBookings),
    revenuePerWinMinor: div(rev, c.wins),
    anomaly: c.anomaly,
    notes,
  };
}

/** Team totals: sums, then sum/sum rates. Never a mean of column percentages. */
export function sourceSheetTotals(columns: SourceSheetColumn[] = sourceSheetColumns): SourceSheetColumn {
  const sumOf = (f: (c: SourceSheetColumn) => number) => columns.reduce((s, c) => s + f(c), 0);
  return {
    repLabel: "team_total",
    displayName: "Team total (sum of columns as read)",
    leadTier: 1,
    leads: sumOf((c) => c.leads),
    retainedBookings: sumOf((c) => c.retainedBookings),
    shows: sumOf((c) => c.shows),
    perceivedQualified: sumOf((c) => c.perceivedQualified),
    wins: sumOf((c) => c.wins),
    reportedRevenue: { amountMinor: sumOf((c) => c.reportedRevenue.amountMinor), currency: "USD" },
    basis: "reported_revenue",
    basisNote: "reported_revenue_basis_unknown",
    provenance: "visual_reading_of_screenshot",
    verified: false,
    anomaly: "team total includes columns with retained exceeding leads; sheet-level speaker figures (2,671 leads, 1,633 retained, ~800 shows) are not reproduced exactly by this reading",
  };
}

/**
 * Counterfactual, explicitly not a forecast (SOS-01):
 * apply one column's observed revenue per lead to another lead count.
 * 776 x (686000 / 129) = $4,126,635.66
 */
export function counterfactualRevenueAtLeads(source: SourceSheetColumn, leads: number): {
  amountMinor: number;
  dollars: number;
  label: "arithmetic scenario, not a forecast";
  assumptions: string[];
} {
  const rplMinor = source.reportedRevenue.amountMinor / source.leads;
  const amountMinor = leads * rplMinor;
  return {
    amountMinor,
    dollars: amountMinor / 100,
    label: "arithmetic scenario, not a forecast",
    assumptions: [
      "Same lead mix, availability, conversion behavior, offer value, and downstream capacity despite a major change in volume.",
      "Crosses lead tiers when applied to a different tier's volume.",
      "Not expected income, a hiring promise, or money owed by an employee.",
    ],
  };
}

/** SOS-20 display sequence for the corrected source example. */
export function sourceFunnelText(c: SourceSheetColumn): string {
  const dollars = Math.round(c.reportedRevenue.amountMinor / 100).toLocaleString("en-US");
  return `${c.leads} assigned source leads → ${c.retainedBookings} retained bookings → ${c.shows} shows → ${c.perceivedQualified} perceived qualified → ${c.wins} wins → $${dollars} reported revenue`;
}
