import type { Metadata } from "next";
import { ChalkboardTeacher } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return (
    <>
      <PageHeader title="Coach" subtitle="One controllable action per rep, with evidence." />
      <EmptyState
        icon={<ChalkboardTeacher size={28} weight="regular" />}
        title="No evidence yet"
        evidence="Coaching needs at least 40 matured appointments in a cohort. Recommendations stay suppressed while data is stale."
        action={
          <Button variant="secondary" size="sm">
            See maturity policy
          </Button>
        }
      />
    </>
  );
}
