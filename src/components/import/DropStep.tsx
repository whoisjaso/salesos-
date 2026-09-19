"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { PRESETS, type SourcePreset } from "@/domain/migration";
import { cn } from "@/lib/cn";
import { Surface } from "@/components/ui/Surface";
import { LogoTile } from "@/components/connect/LogoTile";
import { PRESET_TILES, presetProvider, sampleCsv, sampleLabel } from "./import-model";

export interface LoadedFile {
  name: string;
  text: string;
  /** Set when the file came from a preset tile. */
  preset?: SourcePreset;
}

export interface DropStepProps {
  onLoad: (file: LoadedFile) => void;
}

const ACCEPT = ".csv,.txt,text/csv,text/plain";

export function DropStep({ onLoad }: DropStepProps) {
  const [over, setOver] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (file: File | null | undefined) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".numbers")) {
      setHint("Save as CSV first");
      return;
    }
    setHint(null);
    const reader = new FileReader();
    reader.onload = () => onLoad({ name: file.name, text: String(reader.result ?? "") });
    reader.onerror = () => setHint("Could not read that file");
    reader.readAsText(file);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files?.[0]);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    take(e.target.files?.[0]);
    e.target.value = "";
  };

  const onPreset = (preset: SourcePreset) => {
    const text = sampleCsv(preset);
    if (!text) {
      setHint(`No sample for ${PRESETS[preset].label} yet`);
      return;
    }
    setHint(null);
    onLoad({ name: sampleLabel(preset), text, preset });
  };

  return (
    <div className="flex flex-col gap-6">
      <Surface
        as="button"
        padding="none"
        interactive
        aria-label="Drop a CSV here or tap to choose"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn("w-full transition-colors", over && "bg-accent-soft")}
      >
        <span className={cn("m-2 flex min-h-[248px] flex-col items-center justify-center gap-4 rounded-md border border-dashed px-6 text-center transition-colors", over ? "border-accent" : "border-line-strong")}>
          <span className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent">
            <UploadSimple size={30} weight="bold" aria-hidden />
          </span>
          <span>
            <span className="block text-[19px] font-semibold text-fg">Drop your file</span>
            <span className="mt-1 block text-[13px] text-fg-muted">CSV or Excel export</span>
          </span>
          <span className="inline-flex h-10 items-center rounded-sm bg-accent px-4 text-[14px] font-medium text-accent-fg">Choose file</span>
          {hint ? (
            <span role="status" className="text-[13px] font-medium text-perf-attention">
              {hint}
            </span>
          ) : null}
        </span>
      </Surface>
      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={onChange} />

      <section aria-label="Or start from" className="flex flex-col gap-2">
        <h2 className="px-1 text-[13px] font-medium text-fg-muted">Or start from</h2>
        <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-1 sm:px-1">
          {PRESET_TILES.map((preset) => {
            const p = presetProvider(preset);
            return (
              <li key={preset} className="shrink-0">
                <button type="button" onClick={() => onPreset(preset)} className="flex w-[84px] flex-col items-center gap-2 rounded-md py-1 text-center transition-transform active:scale-[0.97] motion-reduce:transition-none">
                  <LogoTile p={p} size={64} />
                  <span className="line-clamp-2 text-[11.5px] font-medium leading-tight text-fg">{p.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
