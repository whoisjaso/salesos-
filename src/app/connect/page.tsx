import type { Metadata } from "next";
import { ConnectScreen } from "@/components/connect/ConnectScreen";

export const metadata: Metadata = { title: "Connect" };

/** Owner's integrations screen. Connected sources, popular providers, the full catalog. */
export default function ConnectPage() {
  return <ConnectScreen />;
}
