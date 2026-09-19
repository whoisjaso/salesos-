"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import type { SyncResult } from "@/domain/crmSync";
import { parseCsv, type SourcePreset } from "@/domain/migration";
import { cn } from "@/lib/cn";
import { Surface } from "@/components/ui/Surface";
import { LogoTile } from "@/components/connect/LogoTile";
import { ConnectCrmSheet } from "./ConnectCrmSheet";
import { CRM_SOURCES, type CrmSource } from "./import-model";

export interface LoadedTable {
  /** What the receipt calls it: the file name, or "HubSpot sync". */
  name: string;
  headers: string[];
  rows: string[][];
  /** Known when the data came through a CRM connection. */
  preset?: SourcePreset;
}

export interface BringStepProps {
  tenantId: string;
  onLoad: (table: LoadedTable) => void;
}

const ACCEPT = ".csv,.txt,text/csv,text/plain";

/** OAuth first: six CRM tiles, then a smaller file drop under them. */
export function BringStep({ tenantId, onLoad }: BringStepProps) {
  const [source, setSource] = useState<CrmSource | null>(null);
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
    reader.onload = () => {
      const { headers, rows } = parseCsv(String(reader.result ?? ""));
      onLoad({ name: file.name, headers, rows });
    };
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

  const onPulled = (s: CrmSource, sync: SyncResult) => {
    setSource(null);
    onLoad({ name: `${s.provider.name} sync`, headers: sync.headers, rows: sync.rows, preset: s.preset });
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Connect your CRM" className="flex flex-col gap-2">
        <h2 className="px-1 text-[12px] font-medium text-fg-subtle">Connect your CRM</h2>
        <ul className="grid grid-cols-3 gap-2">
          {CRM_SOURCES.map((s) => (
            <li key={s.provider.providerId}>
              <Surface as="button" padding="none" interactive className="w-full" onClick={() => setSource(s)}>
                <span className="flex flex-col items-center gap-2 px-2 py-4">
                  <LogoTile p={s.provider} size={56} />
                  <span className="line-clamp-1 text-[12px] font-medium leading-tight text-fg">{s.provider.name}</span>
                </span>
              </Surface>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Or upload a file" className="flex flex-col gap-2">
        <h2 className="px-1 text-[12px] font-medium text-fg-subtle">Or upload a file</h2>
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
          className={cn("w-full border-dashed transition-colors", over ? "border-accent bg-accent-soft" : "border-line-strong")}
        >
          <span className="flex min-h-16 items-center gap-3 px-4 py-2 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
              <UploadSimple size={20} weight="bold" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-tight text-fg">Drop a CSV</span>
              <span className="mt-0.5 block text-[12px] text-fg-subtle">{hint ?? "Excel export saved as CSV"}</span>
            </span>
            <span className="inline-flex h-8 shrink-0 items-center rounded-sm border border-line-strong px-3 text-[13px] font-medium text-fg">Choose</span>
          </span>
        </Surface>
        {hint ? (
          <p role="status" className="px-1 text-[12.5px] font-medium text-perf-attention">
            {hint}
          </p>
        ) : null}
      </section>
      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={onChange} />

      <ConnectCrmSheet source={source} open={source !== null} tenantId={tenantId} onClose={() => setSource(null)} onPulled={onPulled} />
    </div>
  );
}
