import { RoleGate } from "@/components/shell/RoleGate";

/** Legacy deep link. Coaching and playbooks live in Me. */
export default function Page() {
  return <RoleGate to="/me" />;
}
