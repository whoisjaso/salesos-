import type { ReactNode } from "react";
import { Quotes } from "@phosphor-icons/react/dist/ssr";
import type { SopModule } from "@/content/sops";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";

export interface SopCardProps {
  sop: SopModule;
  id?: string;
  className?: string;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

/** One versioned stage procedure. Every section is a short list; nothing here is a paragraph. */
export function SopCard({ sop, id, className }: SopCardProps) {
  return (
    <Surface as="article" padding="lg" id={id} aria-labelledby={`${sop.sopId}-title`} className={className}>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Chip mono>v{sop.version}</Chip>
          <Chip>Measures {sop.primaryMetricId}</Chip>
          <span className="text-[12px] text-fg-subtle">
            {sop.owner}
            <span aria-hidden className="mx-1.5 text-fg-faint">
              /
            </span>
            Effective {formatDate(sop.effectiveDate)}
          </span>
        </div>
        <h2 id={`${sop.sopId}-title`} className="mt-3 text-[18px] font-semibold leading-tight tracking-tight text-fg sm:text-[20px]">
          {sop.title}
        </h2>
        <p className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-fg-muted">{sop.objective}</p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-line pt-6 sm:grid-cols-2">
        <Section label="Must have">
          <Bullets items={sop.requiredFacts} />
        </Section>
        <Section label="Do">
          <Bullets items={sop.requiredActions} numbered />
        </Section>

        {sop.languageVariants.length > 0 ? (
          <Section label="Say it like" className="sm:col-span-2">
            <ul className="flex flex-col gap-2">
              {sop.languageVariants.map((q) => (
                <li key={q} className="flex gap-2.5 rounded-sm border border-line bg-sunken px-3.5 py-2.5 text-[14px] leading-snug text-fg">
                  <Quotes size={14} weight="fill" aria-hidden className="mt-1 shrink-0 text-fg-faint" />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section label="System does">
          <Bullets items={sop.automation} />
        </Section>
        <Section label="Proof">
          <Bullets items={sop.evidence} />
        </Section>
        <Section label="Exit">
          <Bullets items={sop.exitConditions} />
        </Section>
        <Section label="Stop when">
          <ul className="flex flex-wrap gap-1.5">
            {sop.stopRules.map((r) => (
              <li
                key={r}
                className="rounded-sm border border-[color:var(--perf-issue-line)] px-2 py-1 text-[12px] font-medium leading-snug text-perf-issue"
              >
                {r}
              </li>
            ))}
          </ul>
        </Section>
        <Section label="Guardrails">
          <Bullets items={sop.guardrails} />
        </Section>
      </div>
    </Surface>
  );
}

function Section({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("min-w-0", className)}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{label}</h3>
      {children}
    </section>
  );
}

function Bullets({ items, numbered = false, className }: { items: string[]; numbered?: boolean; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-1.5", className)}>
      {items.map((it, i) => (
        <li key={it} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-fg">
          {numbered ? (
            <span className="tabular w-4 shrink-0 text-right text-[12px] leading-[1.35rem] text-fg-subtle">{i + 1}</span>
          ) : (
            <span aria-hidden className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-fg-faint" />
          )}
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Chip({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-sm border border-line-strong px-2 text-[12px] font-medium text-fg-muted",
        mono && "font-mono tabular",
      )}
    >
      {children}
    </span>
  );
}
