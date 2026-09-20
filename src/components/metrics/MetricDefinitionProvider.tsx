"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MetricPayload, PerformanceVerdict } from "@/domain/types";
import { MetricDefinitionSheet, type MetricDefinitionText } from "./MetricDefinitionSheet";

export interface OpenMetricOptions {
  verdict?: PerformanceVerdict;
  definition?: MetricDefinitionText;
}

interface MetricDefinitionApi {
  open: (metric: MetricPayload, opts?: OpenMetricOptions) => void;
  close: () => void;
}

const Ctx = createContext<MetricDefinitionApi>({ open: () => {}, close: () => {} });

/** Any metric click anywhere opens the shared definition sheet. Mounted once in AppShell. */
export function MetricDefinitionProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ metric: MetricPayload; opts?: OpenMetricOptions } | null>(null);
  const [open, setOpen] = useState(false);

  const api = useMemo<MetricDefinitionApi>(
    () => ({
      open: (metric, opts) => {
        setCurrent({ metric, opts });
        setOpen(true);
      },
      close: () => setOpen(false),
    }),
    [],
  );
  const close = useCallback(() => setOpen(false), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <MetricDefinitionSheet
        open={open}
        onClose={close}
        metric={current?.metric ?? null}
        verdict={current?.opts?.verdict}
        definition={current?.opts?.definition}
      />
    </Ctx.Provider>
  );
}

export function useMetricDefinition(): MetricDefinitionApi {
  return useContext(Ctx);
}
