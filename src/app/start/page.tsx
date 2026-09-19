import type { Metadata } from "next";
import { StartScreen } from "@/components/onboarding/StartScreen";

export const metadata: Metadata = { title: "Create a business" };

/** Deep link for the owner path: sign in, then create the business. */
export default function StartPage() {
  return <StartScreen />;
}
