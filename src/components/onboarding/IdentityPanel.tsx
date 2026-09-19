"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, DeviceMobile, EnvelopeSimple, GoogleLogo } from "@phosphor-icons/react";
import { isValidE164, isValidEmail, type Identity } from "@/domain/onboarding";
import { AuthError, SIMULATED_PHONE_CODE, SimulatedAuthAdapter } from "@/data/auth";
import { auth, setIdentity } from "@/lib/onboarding";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ease, INPUT, LABEL, Refusal, SimulatedTag } from "./bits";

type Step = "choose" | "google" | "email" | "email_sent" | "phone" | "phone_code";

export interface IdentityPanelProps {
  onIdentity: (identity: Identity) => void;
  /** A quiet line above the buttons, like the team a link points at. */
  intro?: React.ReactNode;
}

/**
 * Three ways in, no password: Google, work email link, phone code. The pilot
 * runs SimulatedAuthAdapter; each provider step says so with a tag (D04).
 */
export function IdentityPanel({ onIdentity, intro }: IdentityPanelProps) {
  const reduce = useReducedMotion();
  const ids = { google: useId(), email: useId(), phone: useId(), code: useId() };
  const [step, setStep] = useState<Step>("choose");
  const [googleEmail, setGoogleEmail] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = (identity: Identity) => {
    setIdentity(identity);
    onIdentity(identity);
  };

  const run = async (fn: () => Promise<Identity>) => {
    setBusy(true);
    setError(null);
    try {
      done(await fn());
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "That did not go through. Try again");
    } finally {
      setBusy(false);
    }
  };

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const sendLink = async () => {
    if (!isValidEmail(email)) {
      setError("Enter a work email address");
      return;
    }
    setBusy(true);
    await auth.sendEmailLink(email, `${window.location.origin}/`);
    setBusy(false);
    go("email_sent");
  };

  const sendCode = async () => {
    if (!isValidE164(phone)) {
      setError("Phone with country code, like +15551234567");
      return;
    }
    setBusy(true);
    await auth.sendPhoneCode(phone);
    setBusy(false);
    setCode(SIMULATED_PHONE_CODE);
    go("phone_code");
  };

  const back = (
    <button type="button" onClick={() => go("choose")} className="inline-flex h-8 items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg">
      <ArrowLeft size={14} weight="bold" aria-hidden />
      Back
    </button>
  );

  return (
    <div className="flex flex-col">
      {intro}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.2, ease }}>
          {step === "choose" ? (
            <div className="flex flex-col gap-2">
              <ProviderButton icon={<GoogleLogo size={20} weight="bold" />} onClick={() => go("google")}>
                Continue with Google
              </ProviderButton>
              <ProviderButton icon={<EnvelopeSimple size={20} weight="bold" />} onClick={() => go("email")}>
                Continue with work email
              </ProviderButton>
              <ProviderButton icon={<DeviceMobile size={20} weight="bold" />} onClick={() => go("phone")}>
                Continue with phone
              </ProviderButton>
              <p className="mt-1 text-[12px] text-fg-subtle">No passwords</p>
            </div>
          ) : null}

          {step === "google" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isValidEmail(googleEmail)) {
                  setError("Pick a Google account by its email");
                  return;
                }
                void run(() => auth.completeGoogle(SimulatedAuthAdapter.googleCode(googleEmail)));
              }}
            >
              <div className="flex items-center justify-between">
                <span className="section-label">Choose an account</span>
                <SimulatedTag />
              </div>
              <div>
                <label htmlFor={ids.google} className={LABEL}>
                  Google account
                </label>
                <input id={ids.google} type="email" inputMode="email" autoComplete="email" autoFocus value={googleEmail} onChange={(e) => setGoogleEmail(e.target.value)} placeholder="you@gmail.com" className={INPUT} aria-invalid={Boolean(error)} />
                {error ? <Refusal>{error}</Refusal> : null}
              </div>
              <div className="flex items-center justify-between">
                {back}
                <Button type="submit" size="lg" disabled={busy} leading={<GoogleLogo size={16} weight="bold" />}>
                  Continue
                </Button>
              </div>
            </form>
          ) : null}

          {step === "email" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void sendLink();
              }}
            >
              <div>
                <label htmlFor={ids.email} className={LABEL}>
                  Work email
                </label>
                <input id={ids.email} type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={INPUT} aria-invalid={Boolean(error)} />
                {error ? <Refusal>{error}</Refusal> : null}
              </div>
              <div className="flex items-center justify-between">
                {back}
                <Button type="submit" size="lg" disabled={busy} leading={<EnvelopeSimple size={16} weight="bold" />}>
                  Send link
                </Button>
              </div>
            </form>
          ) : null}

          {step === "email_sent" ? (
            <div className="flex flex-col gap-3">
              <div className="surface flex flex-col gap-1 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[17px] font-semibold text-fg">Check your email</span>
                  <SimulatedTag />
                </div>
                <span className="truncate text-[13px] text-fg-muted">{email.trim().toLowerCase()}</span>
                <span className="text-[12px] text-fg-subtle">Link valid once</span>
              </div>
              {error ? <Refusal>{error}</Refusal> : null}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => go("email")} className="inline-flex h-8 items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg">
                  <ArrowLeft size={14} weight="bold" aria-hidden />
                  Different address
                </button>
                <Button size="lg" disabled={busy} onClick={() => void run(() => auth.completeEmailLink(SimulatedAuthAdapter.emailLinkToken(email)))}>
                  Open link
                </Button>
              </div>
            </div>
          ) : null}

          {step === "phone" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <div>
                <label htmlFor={ids.phone} className={LABEL}>
                  Phone
                </label>
                <input id={ids.phone} type="tel" inputMode="tel" autoComplete="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" className={INPUT} aria-invalid={Boolean(error)} />
                {error ? <Refusal>{error}</Refusal> : <p className="mt-1.5 text-[12px] text-fg-subtle">With country code</p>}
              </div>
              <div className="flex items-center justify-between">
                {back}
                <Button type="submit" size="lg" disabled={busy} leading={<DeviceMobile size={16} weight="bold" />}>
                  Send code
                </Button>
              </div>
            </form>
          ) : null}

          {step === "phone_code" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => auth.verifyPhoneCode(phone, code));
              }}
            >
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor={ids.code} className={LABEL}>
                    Code sent to {phone.trim()}
                  </label>
                  <SimulatedTag />
                </div>
                <input id={ids.code} inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={SIMULATED_PHONE_CODE} className={cn(INPUT, "tabular tracking-[0.3em]")} aria-invalid={Boolean(error)} />
                {error ? <Refusal>{error}</Refusal> : <p className="mt-1.5 text-[12px] text-fg-subtle">Pilot code {SIMULATED_PHONE_CODE}</p>}
              </div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => go("phone")} className="inline-flex h-8 items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg">
                  <ArrowLeft size={14} weight="bold" aria-hidden />
                  Different number
                </button>
                <Button type="submit" size="lg" disabled={busy || code.length < 6}>
                  Verify
                </Button>
              </div>
            </form>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ProviderButton({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface flex h-[52px] w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-fg transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99] motion-reduce:transition-none"
    >
      <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-fg" aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  );
}
