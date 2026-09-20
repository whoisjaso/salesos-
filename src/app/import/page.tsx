import type { Metadata } from "next";
import { ImportScreen } from "@/components/import/ImportScreen";

export const metadata: Metadata = { title: "Import" };

/** Owner's import flow. Drop a file, review what we matched, check the dry run, done. */
export default function ImportPage() {
  return <ImportScreen />;
}
