import type { Metadata } from "next";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" subtitle="Comparable performance and personal progress." />
      <EmptyState
        icon={<UsersThree size={28} weight="regular" />}
        title="No evidence yet"
        evidence="Comparisons need two reps with matured samples on the same lead tier. Until then, only personal progress can be shown."
        action={
          <Button variant="secondary" size="sm">
            View rules
          </Button>
        }
      />
    </>
  );
}
