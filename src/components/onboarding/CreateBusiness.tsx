"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, Check } from "@phosphor-icons/react";
import { ACCENTS, type Accent } from "@/domain/profile";
import type { Identity } from "@/domain/onboarding";
import type { Tenant } from "@/domain/types";
import { clientNow, createBusiness, saveBrand } from "@/lib/onboarding";
import { ACCENT_HEX, ACCENT_WORD, shrinkPhoto } from "@/lib/profiles";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { CURRENCIES, Dots, ease, INPUT, LABEL, Refusal, TIMEZONES } from "./bits";
import { EnterBusiness } from "./EnterBusiness";

type Step = "business" | "brand" | "profile";
const STEPS: Step[] = ["business", "brand", "profile"];
const WORD: Record<Step, string> = { business: "Business", brand: "Brand", profile: "You" };

export interface CreateBusinessProps {
  identity: Identity;
  onCancel?: () => void;
}

function guessTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && TIMEZONES.includes(tz) ? tz : TIMEZONES[0];
  } catch {
    return TIMEZONES[0];
  }
}

/**
 * Owner path steps 2 and 3 (docs/ONBOARDING.md): name, timezone, currency create
 * the tenant; logo and accent are the business profile; then the owner's own
 * profile through the same ProfileSetup reps use. Lands on Business.
 */
export function CreateBusiness({ identity, onCancel }: CreateBusinessProps) {
  const reduce = useReducedMotion();
  const ids = { name: useId(), tz: useId(), cur: useId() };
  const [step, setStep] = useState<Step>("business");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(guessTimezone);
  const [currency, setCurrency] = useState("USD");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [accent, setAccent] = useState<Accent>("blue");
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const index = STEPS.indexOf(step);

  const create = () => {
    setError(null);
    if (!name.trim()) {
      setError("Business name");
      return;
    }
    try {
      const result = createBusiness({ name, timezone, currency }, identity);
      setTenant(result.tenant);
      setStep("brand");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the business");
    }
  };

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setLogo(await shrinkPhoto(file));
    } catch {
      setError("Could not read that image");
    } finally {
      setBusy(false);
    }
  };

  const finishBrand = () => {
    if (!tenant) return;
    saveBrand({ tenantId: tenant.tenantId, accent, logoDataUrl: logo, completedAt: clientNow() });
    setStep("profile");
  };

  if (step === "profile" && tenant) return <EnterBusiness identity={identity} tenantId={tenant.tenantId} />;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col pt-4 sm:pt-16">
      <div className="text-[12px] font-medium text-fg-subtle">Sales OS</div>
      <div className="mt-6">
        <Dots steps={2} index={index} word={WORD[step]} />
      </div>
      <div className="relative mt-6 min-h-[260px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -12 }} transition={{ duration: 0.22, ease }}>
            {step === "business" ? (
              <form
                noValidate
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  create();
                }}
              >
                <div>
                  <label htmlFor={ids.name} className={LABEL}>
                    Business name
                  </label>
                  <input id={ids.name} value={name} maxLength={60} autoFocus autoComplete="organization" onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(error)} className={INPUT} />
                  {error ? <Refusal>{error}</Refusal> : null}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
                  <div>
                    <label htmlFor={ids.tz} className={LABEL}>
                      Timezone
                    </label>
                    <select id={ids.tz} value={timezone} onChange={(e) => setTimezone(e.target.value)} className={cn(INPUT, "appearance-none")}>
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={ids.cur} className={LABEL}>
                      Currency
                    </label>
                    <select id={ids.cur} value={currency} onChange={(e) => setCurrency(e.target.value)} className={cn(INPUT, "appearance-none")}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[12px] text-fg-subtle">Money is reported in this currency. Reps join by invite.</p>
                <footer className="mt-2 flex items-center gap-2">
                  {onCancel ? (
                    <Button variant="ghost" size="lg" onClick={onCancel}>
                      Back
                    </Button>
                  ) : null}
                  <span className="flex-1" />
                  <Button type="submit" size="lg" className="min-w-[112px]">
                    Create
                  </Button>
                </footer>
              </form>
            ) : null}

            {step === "brand" ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden
                    className="inline-grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-sunken text-[20px] font-semibold text-fg-muted"
                    style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT_HEX[accent]} 40%, transparent)` }}
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL from the onboarding store
                      <img src={logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (name.trim()[0] ?? "B").toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[17px] font-semibold text-fg">{tenant?.name}</div>
                    <div className="truncate text-[12px] text-fg-subtle">
                      {timezone.replace(/_/g, " ")}, {currency}
                    </div>
                  </div>
                </div>
                <input ref={logoRef} type="file" accept="image/*" onChange={onLogo} className="sr-only" aria-label="Choose a logo" />
                <div>
                  <Button variant="secondary" size="md" leading={<Camera size={16} weight="bold" />} onClick={() => logoRef.current?.click()} disabled={busy}>
                    {busy ? "Reading" : logo ? "Change logo" : "Logo"}
                  </Button>
                  {error ? <Refusal>{error}</Refusal> : null}
                </div>
                <div>
                  <div className={LABEL}>Accent</div>
                  <div role="radiogroup" aria-label="Accent color" className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                    {ACCENTS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={accent === a}
                        aria-label={ACCENT_WORD[a]}
                        onClick={() => setAccent(a)}
                        className={cn("inline-grid h-11 w-11 place-items-center rounded-full transition-transform duration-150 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100", accent === a ? "ring-2 ring-offset-2 ring-offset-base" : "")}
                        style={{ backgroundColor: ACCENT_HEX[a], ["--tw-ring-color" as string]: ACCENT_HEX[a] }}
                      >
                        {accent === a ? <Check size={16} weight="bold" aria-hidden className="text-[color:var(--bg-base)]" /> : null}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-fg-subtle">{ACCENT_WORD[accent]}. Tints the business mark.</p>
                </div>
                <footer className="mt-2 flex items-center gap-2">
                  <span className="flex-1" />
                  <Button variant="ghost" size="lg" onClick={finishBrand}>
                    Skip for now
                  </Button>
                  <Button size="lg" onClick={finishBrand} disabled={busy} className="min-w-[112px]">
                    Next
                  </Button>
                </footer>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
