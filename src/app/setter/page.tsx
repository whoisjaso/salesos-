import type { Metadata } from "next";
import { SetterWorkspace } from "@/components/workspace/SetterWorkspace";

export const metadata: Metadata = { title: "Setter" };

export default function SetterPage() {
  return <SetterWorkspace />;
}
