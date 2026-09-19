import { cn } from "@/lib/cn";
import { STEP_WORD, type Step } from "./import-model";

const STEPS: Step[] = [1, 2, 3, 4];

/** Four dots, one word. The word is the only label. */
export function StepDots({ step }: { step: Step }) {
  return (
    <header className="px-1">
      <ol aria-label={`Step ${step} of 4`} className="flex items-center gap-1.5">
        {STEPS.map((s) => (
          <li
            key={s}
            aria-current={s === step ? "step" : undefined}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
              s === step ? "w-6 bg-accent" : s < step ? "w-1.5 bg-fg-muted" : "w-1.5 bg-line-strong",
            )}
          />
        ))}
      </ol>
      <h1 className="mt-3 text-[30px] font-semibold leading-none tracking-tight text-fg">{STEP_WORD[step]}</h1>
    </header>
  );
}
