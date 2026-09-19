import type { Metadata } from "next";
import { BookOpenText } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Playbooks" };

export default function PlaybooksPage() {
  return (
    <>
      <PageHeader title="Playbooks" subtitle="Approved stage examples and practice paths." />
      <EmptyState
        icon={<BookOpenText size={28} weight="regular" />}
        title="No evidence yet"
        evidence="Approve one stage example to publish the first playbook. Customer-sensitive material stays out of shared views."
        action={
          <Button variant="secondary" size="sm">
            Approve an example
          </Button>
        }
      />
    </>
  );
}
