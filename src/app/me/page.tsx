import type { Metadata } from "next";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import { buildTodayData } from "@/components/home/today-model";
import { MeScreen } from "@/components/me/MeScreen";
import { sops } from "@/content/sops";
import { adaptationBoundaries } from "@/content/lenses";

export const metadata: Metadata = { title: "Me" };

/** Personal screen. Level, one coaching card, playbook, pay, sign out. */
export default function MePage() {
  const data = buildTodayData(obaviaDataset, NOW);
  return <MeScreen data={data} sops={sops} boundaries={adaptationBoundaries} />;
}
