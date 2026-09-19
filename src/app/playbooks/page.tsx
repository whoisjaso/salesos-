import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { PlaybooksView } from "@/components/playbooks/PlaybooksView";
import { sops } from "@/content/sops";
import { adaptationBoundaries } from "@/content/lenses";

export const metadata: Metadata = { title: "Playbooks" };

/** Server wrapper. Content is static; the stage selection lives in PlaybooksView. */
export default function PlaybooksPage() {
  return (
    <>
      <PageHeader title="Playbooks" subtitle="Versioned stage procedures. Change on evidence, not on the calendar." />
      <PlaybooksView sops={sops} boundaries={adaptationBoundaries} />
    </>
  );
}
