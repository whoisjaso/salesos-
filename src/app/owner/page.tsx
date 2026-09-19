import type { Metadata } from "next";
import { ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Owner" };

export default function OwnerPage() {
  return (
    <>
      <PageHeader title="Owner" subtitle="Acquisition, collected cash, comparable funnel, and bottlenecks." />
      <EmptyState
        icon={<ChartLineUp size={28} weight="regular" />}
        title="No evidence yet"
        evidence="Connect a revenue ledger and an appointment source. The owner view needs collected cash and matured appointments before it can show a comparable funnel."
        action={
          <Button variant="secondary" size="sm">
            Connect a source
          </Button>
        }
      />
    </>
  );
}
