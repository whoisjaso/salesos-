/**
 * Auth adapter: identity behind an interface (docs/ONBOARDING.md, "Identity, OAuth first").
 *
 * Ways in: Google, work email magic link, phone one-time code. No passwords, ever.
 * Production is Supabase Auth (D04). The pilot runs SimulatedAuthAdapter, which is
 * deterministic so journeys can be tested without a provider.
 *
 * Time is injected (`now`). No adapter calls Date.now().
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODateTime } from "@/domain/types";
import type { Identity, IdentityProvider } from "@/domain/onboarding";
import { fnv1a } from "@/domain/intake";

export interface AuthAdapter {
  /** Returns the URL to send the browser to. */
  beginGoogle(redirectUri: string): Promise<{ url: string }>;
  /** Exchange the code returned to `redirectUri` for an identity. */
  completeGoogle(code: string): Promise<Identity>;
  sendEmailLink(email: string, redirectUri: string): Promise<{ sent: true }>;
  completeEmailLink(token: string): Promise<Identity>;
  sendPhoneCode(phone: string): Promise<{ sent: true }>;
  verifyPhoneCode(phone: string, code: string): Promise<Identity>;
  signOut(): Promise<void>;
}

export class AuthError extends Error {
  constructor(
    public readonly code: "invalid_code" | "invalid_token" | "unknown_subject" | "provider_error",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Stable identity id for a provider and subject. */
export function identityIdFor(provider: IdentityProvider, subject: string): string {
  return `id_${fnv1a(`${provider}:${subject}`)}`;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Simulated (pilot)
// ---------------------------------------------------------------------------

export const SIMULATED_PHONE_CODE = "246810";

export interface SimulatedAuthOptions {
  now: () => ISODateTime;
}

/**
 * Deterministic stand-in:
 * - Google: the code is "google_" + email; the subject is the email.
 * - Email link: the token is "link_" + fnv1a(lowercased email).
 * - Phone: the code is always "246810".
 */
export class SimulatedAuthAdapter implements AuthAdapter {
  private readonly now: () => ISODateTime;
  private readonly pendingLinks = new Map<string, string>(); // token -> email
  private readonly pendingPhones = new Set<string>();
  private current: Identity | null = null;

  constructor(options: SimulatedAuthOptions) {
    this.now = options.now;
  }

  static emailLinkToken(email: string): string {
    return `link_${fnv1a(email.trim().toLowerCase())}`;
  }

  static googleCode(email: string): string {
    return `google_${email.trim().toLowerCase()}`;
  }

  get currentIdentity(): Identity | null {
    return this.current;
  }

  async beginGoogle(redirectUri: string): Promise<{ url: string }> {
    return { url: `simulated://google?redirect_uri=${encodeURIComponent(redirectUri)}` };
  }

  async completeGoogle(code: string): Promise<Identity> {
    if (!code.startsWith("google_")) throw new AuthError("invalid_code", "That Google sign-in did not complete");
    const email = code.slice("google_".length).trim().toLowerCase();
    if (!email.includes("@")) throw new AuthError("invalid_code", "That Google sign-in did not complete");
    return this.sign("google", email, nameFromEmail(email));
  }

  async sendEmailLink(email: string, _redirectUri: string): Promise<{ sent: true }> {
    const normalized = email.trim().toLowerCase();
    this.pendingLinks.set(SimulatedAuthAdapter.emailLinkToken(normalized), normalized);
    return { sent: true };
  }

  async completeEmailLink(token: string): Promise<Identity> {
    const email = this.pendingLinks.get(token);
    if (!email) throw new AuthError("invalid_token", "That link is not valid. Ask for a new one");
    this.pendingLinks.delete(token);
    return this.sign("email_link", email, nameFromEmail(email));
  }

  async sendPhoneCode(phone: string): Promise<{ sent: true }> {
    this.pendingPhones.add(phone.trim());
    return { sent: true };
  }

  async verifyPhoneCode(phone: string, code: string): Promise<Identity> {
    const normalized = phone.trim();
    if (!this.pendingPhones.has(normalized)) throw new AuthError("unknown_subject", "Ask for a code first");
    if (code.trim() !== SIMULATED_PHONE_CODE) throw new AuthError("invalid_code", "That code did not match");
    this.pendingPhones.delete(normalized);
    return this.sign("phone_otp", normalized);
  }

  async signOut(): Promise<void> {
    this.current = null;
  }

  private sign(provider: IdentityProvider, subject: string, displayName?: string): Identity {
    const identity: Identity = {
      identityId: identityIdFor(provider, subject),
      provider,
      subject,
      displayName,
      verifiedAt: this.now(),
    };
    this.current = identity;
    return identity;
  }
}

// ---------------------------------------------------------------------------
// Supabase Auth (production, D04)
// ---------------------------------------------------------------------------

/**
 * Maps the interface onto supabase-js auth. Takes a client so it compiles and
 * constructs without env; the caller builds the client from
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (browser key only).
 *
 * TODO(D04): redirect handling. `beginGoogle` asks supabase-js not to redirect
 * itself and returns the provider URL; the app must send the browser there and,
 * on return, hand the `code` query parameter to `completeGoogle`. The email link
 * lands on `redirectUri` with a `token_hash` that `completeEmailLink` verifies.
 */
export class SupabaseAuthAdapter implements AuthAdapter {
  constructor(
    private readonly client: SupabaseClient,
    private readonly now: () => ISODateTime,
  ) {}

  async beginGoogle(redirectUri: string): Promise<{ url: string }> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUri, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw new AuthError("provider_error", error?.message ?? "Google sign-in is not available");
    return { url: data.url };
  }

  async completeGoogle(code: string): Promise<Identity> {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    if (error || !data.user) throw new AuthError("invalid_code", error?.message ?? "That Google sign-in did not complete");
    const u = data.user;
    const googleSub = u.identities?.find((i) => i.provider === "google")?.id ?? u.id;
    return this.identity("google", googleSub, u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email);
  }

  async sendEmailLink(email: string, redirectUri: string): Promise<{ sent: true }> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUri, shouldCreateUser: true },
    });
    if (error) throw new AuthError("provider_error", error.message);
    return { sent: true };
  }

  async completeEmailLink(token: string): Promise<Identity> {
    // TODO(D04): the token is the `token_hash` query parameter on the redirect page.
    const { data, error } = await this.client.auth.verifyOtp({ token_hash: token, type: "email" });
    if (error || !data.user?.email) throw new AuthError("invalid_token", error?.message ?? "That link is not valid. Ask for a new one");
    return this.identity("email_link", data.user.email.toLowerCase(), data.user.user_metadata?.full_name);
  }

  async sendPhoneCode(phone: string): Promise<{ sent: true }> {
    const { error } = await this.client.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
    if (error) throw new AuthError("provider_error", error.message);
    return { sent: true };
  }

  async verifyPhoneCode(phone: string, code: string): Promise<Identity> {
    const { data, error } = await this.client.auth.verifyOtp({ phone, token: code, type: "sms" });
    if (error || !data.user) throw new AuthError("invalid_code", error?.message ?? "That code did not match");
    return this.identity("phone_otp", data.user.phone ? `+${data.user.phone.replace(/^\+/, "")}` : phone);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  private identity(provider: IdentityProvider, subject: string, displayName?: string): Identity {
    return { identityId: identityIdFor(provider, subject), provider, subject, displayName, verifiedAt: this.now() };
  }
}
