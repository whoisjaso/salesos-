"use client";

import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, Check, Trash } from "@phosphor-icons/react";
import { ACCENTS, type Accent, type BusinessProfile, type Profile, normalizeHandle, suggestHandle, validateProfile } from "@/domain/profile";
import { obaviaDataset } from "@/fixtures/obavia";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ACCENT_HEX, ACCENT_WORD, clientNow, shrinkPhoto, useProfiles } from "@/lib/profiles";

type StepId = "photo" | "name" | "how" | "color" | "business";

const STEP_WORD: Record<StepId, string> = {
  photo: "Photo",
  name: "Name",
  how: "How I sell",
  color: "Color",
  business: "Business",
};

const REP_STEPS: StepId[] = ["photo", "name", "how", "color"];
const OWNER_STEPS: StepId[] = ["photo", "name", "how", "color", "business"];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Berlin",
  "Australia/Sydney",
];
const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN"];

const INPUT = "h-11 w-full min-w-0 rounded-sm border border-line-strong bg-sunken px-3 text-[16px] text-fg placeholder:text-fg-faint focus:border-line-focus focus:outline-none";
const LABEL = "mb-1.5 block text-[12px] font-medium text-fg-subtle";

const ease = [0.16, 1, 0.3, 1] as const;

export interface ProfileSetupProps {
  userId: string;
  /** setup: first sign-in, full screen, step by step. edit: inside a sheet, any step, Save on every step. */
  mode?: "setup" | "edit";
  onDone: () => void;
  onCancel?: () => void;
  tenantName?: string;
}

/**
 * Four quick steps on one screen: Photo, Name, How I sell, Color. The owner
 * adds Business. Labels, not sentences. Done saves with completedAt.
 */
export function ProfileSetup({ userId, mode = "setup", onDone, onCancel, tenantName = "Obavia" }: ProfileSetupProps) {
  const { get, list, save, business, saveBusiness } = useProfiles();
  const reduce = useReducedMotion();
  const initial = get(userId);
  const user = obaviaDataset.users.find((u) => u.userId === userId);
  const isOwner = user?.roles.includes("owner") ?? false;
  const steps = isOwner ? OWNER_STEPS : REP_STEPS;
  const edit = mode === "edit";

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Profile>(() => ({ ...initial, handle: initial.handle || suggestHandle(initial.displayName) }));
  const [biz, setBiz] = useState<BusinessProfile>(business);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), handle: useId(), how: useId(), bizName: useId(), tz: useId(), cur: useId() };

  const step = steps[index];
  const last = index === steps.length - 1;
  const errors = useMemo(() => validateProfile(draft, list()), [draft, list]);
  const nameErrors = errors.filter((e) => e.startsWith("Name") || e.startsWith("Handle"));
  const handleError = nameErrors.find((e) => e.startsWith("Handle"));
  const nameError = nameErrors.find((e) => e.startsWith("Name"));
  const handleOk = draft.handle.length >= 3 && !handleError;

  const update = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>, target: "photo" | "logo") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const dataUrl = await shrinkPhoto(file);
      const stamp = clientNow();
      if (target === "photo") update({ photo: { dataUrl, updatedAt: stamp } });
      else setBiz((b) => ({ ...b, logo: { dataUrl, updatedAt: stamp } }));
    } catch {
      setPhotoError("Could not read that image");
    } finally {
      setPhotoBusy(false);
    }
  };

  const stepValid = (s: StepId): boolean => {
    if (s === "name") return nameErrors.length === 0;
    if (s === "business") return biz.name.trim().length > 0;
    return true;
  };

  const finish = () => {
    const now = clientNow();
    const profile: Profile = {
      ...draft,
      displayName: draft.displayName.trim(),
      howISell: draft.howISell?.trim() || undefined,
      completedAt: draft.completedAt ?? now,
      updatedAt: now,
    };
    const result = save(profile);
    if (!result.ok) {
      setSaveErrors(result.errors);
      setTouched(true);
      return;
    }
    if (isOwner) {
      const b = saveBusiness({ ...biz, name: biz.name.trim(), updatedAt: now });
      if (!b.ok) {
        setSaveErrors(b.errors);
        return;
      }
    }
    onDone();
  };

  const next = () => {
    setTouched(true);
    if (!stepValid(step)) return;
    if (edit || last) {
      if (errors.length === 0 && (!isOwner || biz.name.trim())) finish();
      else setIndex(steps.findIndex((s) => !stepValid(s)));
      return;
    }
    setTouched(false);
    setIndex((i) => i + 1);
  };

  const go = (i: number) => {
    setTouched(false);
    setIndex(i);
  };

  const primaryLabel = edit ? "Save" : last ? "Done" : "Next";

  return (
    <div className={cn("flex w-full flex-col", edit ? "pb-2" : "mx-auto max-w-[440px] pt-4 sm:pt-16")}>
      {!edit ? <div className="text-[12px] font-medium text-fg-subtle">{tenantName}</div> : null}
      <header className={edit ? "" : "mt-6"}>
        <ol aria-label={`Step ${index + 1} of ${steps.length}`} className="flex items-center gap-1.5">
          {steps.map((s, i) => {
            const cls = cn(
              "block h-1.5 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
              i === index ? "w-6 bg-accent" : i < index ? "w-1.5 bg-fg-muted" : "w-1.5 bg-line-strong",
            );
            return (
              <li key={s} aria-current={i === index ? "step" : undefined}>
                {edit ? (
                  <button type="button" onClick={() => go(i)} aria-label={STEP_WORD[s]} className="-my-2 flex h-6 items-center px-0.5">
                    <span className={cls} />
                  </button>
                ) : (
                  <span className={cls} />
                )}
              </li>
            );
          })}
        </ol>
        {edit ? (
          <h3 className="mt-3 text-[20px] font-semibold leading-none tracking-tight text-fg">{STEP_WORD[step]}</h3>
        ) : (
          <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-fg">{STEP_WORD[step]}</h1>
        )}
      </header>

      <div className="relative mt-6 min-h-[260px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -12 }}
            transition={{ duration: 0.22, ease }}
          >
            {step === "photo" ? (
              <div className="flex flex-col items-center gap-5 pt-2">
                <Avatar userId={userId} size={128} accent={draft.accent} photoUrl={draft.photo?.dataUrl ?? null} />
                <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={(e) => onPhoto(e, "photo")} className="sr-only" aria-label="Choose a photo" />
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="lg" leading={<Camera size={16} weight="bold" />} onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                    {photoBusy ? "Reading" : draft.photo?.dataUrl ? "Change photo" : "Take or choose"}
                  </Button>
                  {draft.photo?.dataUrl ? (
                    <Button variant="ghost" size="lg" leading={<Trash size={16} weight="bold" />} onClick={() => update({ photo: undefined })}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                {photoError ? (
                  <p role="alert" className="text-[13px] text-perf-issue">
                    {photoError}
                  </p>
                ) : (
                  <p className="text-[12px] text-fg-subtle">Your teammates see this. Have fun with it.</p>
                )}
              </div>
            ) : null}

            {step === "name" ? (
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor={ids.name} className={LABEL}>
                    Name
                  </label>
                  <input
                    id={ids.name}
                    value={draft.displayName}
                    maxLength={40}
                    autoComplete="name"
                    onChange={(e) => update({ displayName: e.target.value })}
                    aria-invalid={touched && Boolean(nameError)}
                    className={INPUT}
                  />
                  {touched && nameError ? (
                    <p role="alert" className="mt-1.5 text-[12px] text-perf-issue">
                      {nameError}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor={ids.handle} className={LABEL}>
                    Handle
                  </label>
                  <div className="relative">
                    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[16px] text-fg-subtle">
                      @
                    </span>
                    <input
                      id={ids.handle}
                      value={draft.handle}
                      maxLength={20}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(e) => update({ handle: normalizeHandle(e.target.value) })}
                      aria-invalid={Boolean(handleError)}
                      aria-describedby={`${ids.handle}-hint`}
                      className={cn(INPUT, "pl-8")}
                    />
                  </div>
                  <p id={`${ids.handle}-hint`} className={cn("mt-1.5 flex items-center gap-1 text-[12px]", handleOk ? "text-perf-strong" : "text-fg-subtle")} aria-live="polite">
                    {handleOk ? (
                      <>
                        <Check size={12} weight="bold" aria-hidden />
                        Available
                      </>
                    ) : handleError === "Handle taken" ? (
                      "Taken"
                    ) : (
                      "3 to 20 characters, letters, numbers, dots, underscores"
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            {step === "how" ? (
              <div>
                <label htmlFor={ids.how} className={LABEL}>
                  One line
                </label>
                <input
                  id={ids.how}
                  value={draft.howISell ?? ""}
                  maxLength={80}
                  placeholder="Numbers first, then the demo"
                  onChange={(e) => update({ howISell: e.target.value })}
                  className={INPUT}
                />
                <p className="tabular mt-1.5 text-right text-[12px] text-fg-subtle">{(draft.howISell ?? "").length}/80</p>
                <p className="mt-3 text-[12px] text-fg-subtle">Shows on your card. Never used for routing or pay.</p>
              </div>
            ) : null}

            {step === "color" ? (
              <div className="flex flex-col items-center gap-6 pt-2">
                <Avatar userId={userId} size={64} accent={draft.accent} photoUrl={draft.photo?.dataUrl ?? null} ring={0.66} ringLabel="Preview ring" />
                <div role="radiogroup" aria-label="Accent color" className="grid grid-cols-4 gap-3">
                  {ACCENTS.map((a) => (
                    <Swatch key={a} accent={a} selected={draft.accent === a} onSelect={() => update({ accent: a })} />
                  ))}
                </div>
                <p className="text-[12px] text-fg-subtle">{ACCENT_WORD[draft.accent]}. Tints your ring and your card.</p>
              </div>
            ) : null}

            {step === "business" ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden
                    className="inline-grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-sunken text-[20px] font-semibold text-fg-muted"
                    style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT_HEX[biz.accent]} 40%, transparent)` }}
                  >
                    {biz.logo?.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL from the profile store
                      <img src={biz.logo.dataUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (biz.name.trim()[0] ?? "B").toUpperCase()
                    )}
                  </span>
                  <input ref={logoRef} type="file" accept="image/*" onChange={(e) => onPhoto(e, "logo")} className="sr-only" aria-label="Choose a logo" />
                  <Button variant="secondary" size="md" leading={<Camera size={16} weight="bold" />} onClick={() => logoRef.current?.click()} disabled={photoBusy}>
                    {biz.logo?.dataUrl ? "Change logo" : "Logo"}
                  </Button>
                </div>
                <div>
                  <label htmlFor={ids.bizName} className={LABEL}>
                    Business name
                  </label>
                  <input id={ids.bizName} value={biz.name} maxLength={60} onChange={(e) => setBiz((b) => ({ ...b, name: e.target.value }))} aria-invalid={touched && !biz.name.trim()} className={INPUT} />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
                  <div>
                    <label htmlFor={ids.tz} className={LABEL}>
                      Timezone
                    </label>
                    <select id={ids.tz} value={biz.timezone} onChange={(e) => setBiz((b) => ({ ...b, timezone: e.target.value }))} className={cn(INPUT, "appearance-none")}>
                      {[...new Set([biz.timezone, ...TIMEZONES])].map((tz) => (
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
                    <select id={ids.cur} value={biz.currency} onChange={(e) => setBiz((b) => ({ ...b, currency: e.target.value }))} className={cn(INPUT, "appearance-none")}>
                      {[...new Set([biz.currency, ...CURRENCIES])].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {saveErrors.length > 0 ? (
        <p role="alert" className="mt-3 text-[13px] text-perf-issue">
          {saveErrors.join(". ")}
        </p>
      ) : null}

      <footer className="mt-6 flex items-center gap-2">
        {index > 0 ? (
          <Button variant="ghost" size="lg" onClick={() => go(index - 1)}>
            Back
          </Button>
        ) : edit && onCancel ? (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <span className="flex-1" />
        {step === "photo" && !draft.photo?.dataUrl && !edit ? (
          <Button variant="ghost" size="lg" onClick={next}>
            Skip for now
          </Button>
        ) : null}
        <Button variant="primary" size="lg" onClick={next} disabled={photoBusy} className="min-w-[112px]">
          {primaryLabel}
        </Button>
      </footer>
    </div>
  );
}

function Swatch({ accent, selected, onSelect }: { accent: Accent; selected: boolean; onSelect: () => void }) {
  const hex = ACCENT_HEX[accent];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ACCENT_WORD[accent]}
      onClick={onSelect}
      className={cn(
        "inline-grid h-12 w-12 place-items-center rounded-full transition-transform duration-150 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100",
        selected ? "ring-2 ring-offset-2 ring-offset-base" : "",
      )}
      style={{ backgroundColor: hex, ["--tw-ring-color" as string]: hex }}
    >
      {selected ? <Check size={18} weight="bold" aria-hidden className="text-[color:var(--bg-base)]" /> : null}
    </button>
  );
}
