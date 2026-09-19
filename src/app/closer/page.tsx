import type { Metadata } from "next";
import { CloserWorkspace } from "@/components/workspace/CloserWorkspace";

export const metadata: Metadata = { title: "Closer" };

export default function CloserPage() {
  return <CloserWorkspace />;
}
