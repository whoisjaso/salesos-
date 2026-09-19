import { RoleGate } from "@/components/shell/RoleGate";

/** Legacy deep link. Home renders by role. */
export default function Page() {
  return <RoleGate to="/" />;
}
