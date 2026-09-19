import type { Metadata } from "next";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import { buildTodayData } from "@/components/home/today-model";
import { TodayScreen } from "@/components/home/TodayScreen";

export const metadata: Metadata = { title: "Today" };

/** Today: one hero, one number, one action. Fixture data until live sync (SOS-20 design law). */
export default function TodayPage() {
  const data = buildTodayData(obaviaDataset, NOW);
  return <TodayScreen data={data} defaultUserId="usr_closer_renata" />;
}
