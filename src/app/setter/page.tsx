import type { Metadata } from "next";
import { PhoneCall } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Setter" };

export default function SetterPage() {
  return (
    <>
      <PageHeader title="Setter" subtitle="Next action, queue, and commitments." />
      <EmptyState
        icon={<PhoneCall size={28} weight="regular" />}
        title="No evidence yet"
        evidence="Assign a lead pool to this setter. The queue fills from assigned opportunities with an accountability start."
        action={
          <Button variant="secondary" size="sm">
            Assign leads
          </Button>
        }
      />
    </>
  );
}
