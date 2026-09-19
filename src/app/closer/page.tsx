import type { Metadata } from "next";
import { Handshake } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Closer" };

export default function CloserPage() {
  return (
    <>
      <PageHeader title="Closer" subtitle="Upcoming briefs, open decisions, proposals." />
      <EmptyState
        icon={<Handshake size={28} weight="regular" />}
        title="No evidence yet"
        evidence="Book a first appointment. The closer view opens with the appointment brief and the customer's own words."
        action={
          <Button variant="secondary" size="sm">
            Book appointment
          </Button>
        }
      />
    </>
  );
}
