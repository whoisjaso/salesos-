import { describe, expect, it } from "vitest";
import { AuthError, SIMULATED_PHONE_CODE, SimulatedAuthAdapter, SupabaseAuthAdapter, identityIdFor } from "../auth";
import { fnv1a } from "@/domain/intake";

const NOW = "2026-09-19T12:00:00.000Z";
const adapter = () => new SimulatedAuthAdapter({ now: () => NOW });

describe("SimulatedAuthAdapter", () => {
  it("google round-trips: begin returns a url, complete yields a verified identity", async () => {
    const a = adapter();
    const { url } = await a.beginGoogle("https://app.example/auth/callback");
    expect(url).toContain(encodeURIComponent("https://app.example/auth/callback"));
    const id = await a.completeGoogle(SimulatedAuthAdapter.googleCode("Ola.Owner@Obavia.example"));
    expect(id).toEqual({
      identityId: identityIdFor("google", "ola.owner@obavia.example"),
      provider: "google",
      subject: "ola.owner@obavia.example",
      displayName: "Ola Owner",
      verifiedAt: NOW,
    });
    expect(a.currentIdentity).toEqual(id);
    await a.signOut();
    expect(a.currentIdentity).toBeNull();
  });

  it("rejects a malformed google code", async () => {
    await expect(adapter().completeGoogle("nope")).rejects.toBeInstanceOf(AuthError);
  });

  it("email link round-trips with the deterministic token", async () => {
    const a = adapter();
    await expect(a.sendEmailLink("Sam@Obavia.example", "https://app.example/join")).resolves.toEqual({ sent: true });
    const token = SimulatedAuthAdapter.emailLinkToken("sam@obavia.example");
    expect(token).toBe(`link_${fnv1a("sam@obavia.example")}`);
    const id = await a.completeEmailLink(token);
    expect(id.provider).toBe("email_link");
    expect(id.subject).toBe("sam@obavia.example");
    expect(id.identityId).toBe(identityIdFor("email_link", "sam@obavia.example"));
    // A link is single use.
    await expect(a.completeEmailLink(token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects an unknown email link token", async () => {
    await expect(adapter().completeEmailLink("link_deadbeef")).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("phone code round-trips with 246810", async () => {
    const a = adapter();
    await expect(a.sendPhoneCode("+15551234567")).resolves.toEqual({ sent: true });
    const id = await a.verifyPhoneCode("+15551234567", SIMULATED_PHONE_CODE);
    expect(id).toMatchObject({ provider: "phone_otp", subject: "+15551234567", verifiedAt: NOW });
    expect(id.displayName).toBeUndefined();
  });

  it("rejects a wrong phone code and a phone that never asked for one", async () => {
    const a = adapter();
    await a.sendPhoneCode("+15551234567");
    await expect(a.verifyPhoneCode("+15551234567", "000000")).rejects.toMatchObject({ code: "invalid_code" });
    await expect(a.verifyPhoneCode("+15559999999", SIMULATED_PHONE_CODE)).rejects.toMatchObject({ code: "unknown_subject" });
  });

  it("the same provider and subject always map to the same identity id", async () => {
    const a = adapter();
    const first = await a.completeGoogle(SimulatedAuthAdapter.googleCode("x@y.co"));
    const second = await adapter().completeGoogle(SimulatedAuthAdapter.googleCode("x@y.co"));
    expect(first.identityId).toBe(second.identityId);
    expect(identityIdFor("google", "x@y.co")).not.toBe(identityIdFor("email_link", "x@y.co"));
  });
});

describe("SupabaseAuthAdapter", () => {
  it("maps onto supabase-js auth calls without env", async () => {
    const calls: string[] = [];
    const fakeClient = {
      auth: {
        signInWithOAuth: async (args: unknown) => {
          calls.push(`oauth:${JSON.stringify(args)}`);
          return { data: { url: "https://accounts.google.com/o/oauth2/auth?x=1" }, error: null };
        },
        signInWithOtp: async (args: unknown) => {
          calls.push(`otp:${JSON.stringify(args)}`);
          return { data: {}, error: null };
        },
        verifyOtp: async () => ({ data: { user: { id: "u1", phone: "15551234567", email: "s@x.co", user_metadata: {} } }, error: null }),
        signOut: async () => {
          calls.push("signOut");
          return { error: null };
        },
        exchangeCodeForSession: async () => ({ data: { user: { id: "u1", email: "o@x.co", identities: [{ provider: "google", id: "sub_123" }], user_metadata: { full_name: "Ola" } } }, error: null }),
      },
    };
    // The skeleton only touches `auth`, so a structural fake stands in for the client.
    const a = new SupabaseAuthAdapter(fakeClient as unknown as ConstructorParameters<typeof SupabaseAuthAdapter>[0], () => NOW);
    expect((await a.beginGoogle("https://app.example/cb")).url).toContain("accounts.google.com");
    expect(calls[0]).toContain('"provider":"google"');
    expect(calls[0]).toContain('"skipBrowserRedirect":true');
    const g = await a.completeGoogle("code");
    expect(g).toMatchObject({ provider: "google", subject: "sub_123", displayName: "Ola", verifiedAt: NOW });
    await a.sendEmailLink("s@x.co", "https://app.example/join");
    expect(calls[1]).toContain('"email":"s@x.co"');
    await a.sendPhoneCode("+15551234567");
    expect(calls[2]).toContain('"phone":"+15551234567"');
    expect(await a.verifyPhoneCode("+15551234567", "123456")).toMatchObject({ provider: "phone_otp", subject: "+15551234567" });
    expect(await a.completeEmailLink("hash")).toMatchObject({ provider: "email_link", subject: "s@x.co" });
    await a.signOut();
    expect(calls).toContain("signOut");
  });
});
