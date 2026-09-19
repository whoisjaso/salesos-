"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { applyManualMapping, detectPreset, dryRun, parseCsv, profileColumns, runImport, suggestMapping, type DryRunReport, type ImportContext, type ImportResult, type MappingPlan, type TargetField } from "@/domain/migration";
import type { IntakeContact } from "@/domain/intake";
import { NOW, obaviaDataset, TENANT_ID } from "@/fixtures/obavia";
import { useSession } from "@/lib/session";
import { StepDots } from "./StepDots";
import { DropStep, type LoadedFile } from "./DropStep";
import { MatchStep } from "./MatchStep";
import { CheckStep } from "./CheckStep";
import { DoneStep } from "./DoneStep";
import type { Step } from "./import-model";

/** Owner only. Reps are sent home. */
export function ImportScreen() {
  const router = useRouter();
  const { session, ready } = useSession();
  const owner = !!session && session.role === "owner";

  useEffect(() => {
    if (ready && !owner) router.replace("/");
  }, [ready, owner, router]);

  if (!ready || !owner) return null;
  return <ImportBody />;
}

interface Loaded {
  file: LoadedFile;
  headers: string[];
  rows: string[][];
  profiles: ReturnType<typeof profileColumns>;
  plan: MappingPlan;
}

const CTX: ImportContext = {
  tenantId: TENANT_ID,
  now: NOW,
  existingContacts: obaviaDataset.contacts as IntakeContact[],
  defaultCurrency: "USD",
  users: obaviaDataset.users,
};

/** Client-only state. The import result lives in memory and is never written anywhere. */
function ImportBody() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>(1);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onLoad = useCallback((file: LoadedFile) => {
    const { headers, rows } = parseCsv(file.text);
    const profiles = profileColumns(headers, rows);
    const preset = file.preset ?? detectPreset(headers).preset;
    const plan = suggestMapping(profiles, preset);
    setLoaded({ file, headers, rows, profiles, plan });
    setReport(null);
    setResult(null);
    setStep(2);
  }, []);

  const onChangeTarget = useCallback((header: string, target: TargetField) => {
    setLoaded((l) => (l ? { ...l, plan: applyManualMapping(l.plan, header, target) } : l));
  }, []);

  const onCheck = useCallback(() => {
    if (!loaded) return;
    setReport(dryRun(loaded.plan, loaded.headers, loaded.rows, CTX));
    setStep(3);
  }, [loaded]);

  const onImport = useCallback(() => {
    if (!loaded) return;
    setResult(runImport(loaded.plan, loaded.headers, loaded.rows, CTX));
    setStep(4);
  }, [loaded]);

  const onAgain = useCallback(() => {
    setLoaded(null);
    setReport(null);
    setResult(null);
    setStep(1);
  }, []);

  const fade = useMemo(() => (reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }), [reduce]);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <StepDots step={step} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} {...fade} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
          {step === 1 ? <DropStep onLoad={onLoad} /> : null}
          {step === 2 && loaded ? <MatchStep fileName={loaded.file.name} rowCount={loaded.rows.length} plan={loaded.plan} profiles={loaded.profiles} onChangeTarget={onChangeTarget} onNext={onCheck} /> : null}
          {step === 3 && report ? <CheckStep report={report} onImport={onImport} /> : null}
          {step === 4 && loaded && result ? <DoneStep fileName={loaded.file.name} plan={loaded.plan} report={result.report} at={NOW} onAgain={onAgain} /> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
