import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import type { TeamMember } from "./today-model";

/** One row of reps with their level. The whole row goes to the team page. */
export function TeamPulse({ team, currentUserId }: { team: TeamMember[]; currentUserId: string }) {
  return (
    <Surface padding="none">
      <Link
        href="/team"
        aria-label={`Team: ${team.map((m) => `${m.displayName} level ${m.level}`).join(", ")}. Open team.`}
        className="flex items-center gap-3 rounded-[inherit] p-4 transition-colors hover:bg-hover motion-reduce:transition-none sm:gap-4 sm:p-6"
      >
        <span className="shrink-0 text-[13px] font-medium text-fg-muted">Team</span>
        <ul className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3" aria-hidden>
          {team.map((m) => (
            <li key={m.userId} className="relative shrink-0">
              <span
                className={cn(
                  "inline-grid h-10 w-10 place-items-center rounded-full border text-[12px] font-semibold sm:h-11 sm:w-11 sm:text-[13px]",
                  m.userId === currentUserId ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-raised text-fg",
                )}
              >
                {m.initials}
              </span>
              <span className="tabular absolute -bottom-0.5 -right-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[color:var(--bg-raised)] bg-fg px-1 text-[10px] font-bold leading-none text-[color:var(--bg-raised)]">
                {m.level}
              </span>
            </li>
          ))}
        </ul>
        <CaretRight size={16} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </Link>
    </Surface>
  );
}
