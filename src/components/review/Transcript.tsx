"use client";

import type { TranscriptSpan } from "@/domain/callIntelligence";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatClock as clock } from "@/lib/review";

export interface TranscriptProps {
  transcript: TranscriptSpan[];
  contactName: string;
  /** spanIndex -> labels of fields that cite it. */
  citations: Map<number, string[]>;
  /** The span a moment or coaching card jumped to. */
  active?: number;
  /** The span whose citations are shown. */
  inspected?: number;
  onInspect: (i: number) => void;
  registerRef: (i: number, el: HTMLLIElement | null) => void;
}

/**
 * Two-speaker thread. Customer left, rep right and muted. Cited spans carry the accent
 * outline; the active one is filled. Tap a span to see which fields cite it.
 */
export function Transcript({ transcript, contactName, citations, active, inspected, onInspect, registerRef }: TranscriptProps) {
  return (
    <Surface padding="none" as="section" aria-label="Transcript">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="section-label">Transcript</span>
        <span className="tabular text-[11px] text-fg-subtle">{transcript.length} turns</span>
      </div>
      <ol className="flex flex-col gap-1.5 px-3 py-3">
        {transcript.map((s, i) => {
          const rep = s.speaker === "rep";
          const cited = citations.get(i) ?? [];
          const isActive = active === i;
          const showCites = inspected === i;
          const prev = transcript[i - 1];
          const newSpeaker = !prev || prev.speaker !== s.speaker;
          return (
            <li
              key={`${s.startMs}-${s.endMs}`}
              ref={(el) => registerRef(i, el)}
              data-testid="transcript-span"
              data-span-index={i}
              data-cited={cited.length > 0 ? "true" : undefined}
              data-highlighted={isActive ? "true" : undefined}
              className={cn("flex flex-col", rep ? "items-end" : "items-start", newSpeaker && i > 0 && "mt-2")}
            >
              {newSpeaker ? <span className="mb-0.5 px-1 text-[11px] text-fg-subtle">{rep ? "You" : s.speaker === "customer" ? contactName : "Unknown"}</span> : null}
              <button
                type="button"
                onClick={() => onInspect(i)}
                aria-pressed={showCites}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "max-w-[88%] rounded-md border px-3 py-2 text-left text-[14px] leading-snug transition-colors motion-reduce:transition-none",
                  rep ? "text-fg-muted" : "bg-sunken text-fg",
                  cited.length > 0 ? "border-accent" : rep ? "border-line" : "border-transparent",
                  isActive && "bg-accent-soft text-fg outline-2 outline-offset-2 outline-accent",
                )}
              >
                {s.text}
                <span className="tabular mt-1 block text-[11px] text-fg-subtle">
                  {clock(s.startMs)}
                  {cited.length > 0 ? `, cited ${cited.length}` : ""}
                </span>
              </button>
              {showCites ? (
                <div className={cn("mt-1 flex flex-wrap gap-1 px-1", rep && "justify-end")} data-testid="span-citations">
                  {cited.length > 0 ? (
                    cited.map((label) => (
                      <span key={label} className="tag border-dashed text-accent">
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="tag border-dashed text-fg-subtle">Not cited</span>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Surface>
  );
}
