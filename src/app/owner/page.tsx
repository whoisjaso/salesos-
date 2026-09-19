import type { Metadata } from "next";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import { buildOwnerView } from "@/lib/owner-model";
import { OwnerDashboard } from "@/components/owner/OwnerDashboard";

export const metadata: Metadata = { title: "Owner" };

/**
 * Server computes every cohort combination from the synthetic dataset;
 * the client switches between them and animates. No fetch.
 */
export default function OwnerPage() {
  const view = buildOwnerView(obaviaDataset, NOW);
  const asOf = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(NOW));
  return <OwnerDashboard view={view} subtitle={`As of ${asOf}. Synthetic pilot data.`} />;
}
