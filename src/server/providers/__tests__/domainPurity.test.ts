/**
 * The boundary test. AGENTS.md rule 3 and specification 15.1 both depend on one
 * fact staying true: src/domain is pure, and every impure provider seam lives
 * here in src/server/providers.
 *
 * This test reads the source files from disk. It is deliberately the impure
 * side of the boundary, which is why it lives here and not in src/domain.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAYMENT_ADAPTERS } from "@/server/providers";

const DOMAIN_DIR = join(process.cwd(), "src", "domain");
const PROVIDERS_DIR = join(process.cwd(), "src", "server", "providers");

function sourceFiles(dir: string, skipTests = true): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (skipTests && name === "__tests__") continue;
      out.push(...sourceFiles(full, skipTests));
      continue;
    }
    if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Provider SDKs and HTTP clients. Importing one of these into src/domain ends purity. */
const FORBIDDEN_MODULES = [
  "stripe",
  "@stripe/stripe-js",
  "@stripe/react-stripe-js",
  "whop",
  "@whop-apps/sdk",
  "@whop/api",
  "toast",
  "@toasttab/",
  "axios",
  "node-fetch",
  "undici",
  "got",
  "superagent",
  "ky",
  "node:http",
  "node:https",
  "http",
  "https",
];

function importedModules(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s[^;]*?from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) found.push(m[1]);
  }
  return found;
}

describe("src/domain stays pure", () => {
  const files = sourceFiles(DOMAIN_DIR);

  it("has domain files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("calls fetch in no domain file", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Word-bounded so "prefetch(" and a comment about fetching do not trip it.
      expect(source, file).not.toMatch(/(?<![\w.$])fetch\s*\(/);
      expect(source, file).not.toMatch(/\bXMLHttpRequest\b/);
      expect(source, file).not.toMatch(/\bnavigator\.sendBeacon\b/);
    }
  });

  it("imports no provider SDK and no HTTP client in any domain file", () => {
    for (const file of files) {
      for (const mod of importedModules(readFileSync(file, "utf8"))) {
        expect(FORBIDDEN_MODULES, `${file} imports ${mod}`).not.toContain(mod);
        expect(mod.startsWith("@stripe/"), `${file} imports ${mod}`).toBe(false);
        expect(mod.startsWith("@whop"), `${file} imports ${mod}`).toBe(false);
      }
    }
  });

  it("imports no React in any domain file", () => {
    for (const file of files) {
      for (const mod of importedModules(readFileSync(file, "utf8"))) {
        expect(["react", "react-dom", "next"], `${file} imports ${mod}`).not.toContain(mod);
        expect(mod.startsWith("next/"), `${file} imports ${mod}`).toBe(false);
      }
    }
  });

  it("imports nothing from src/server into src/domain, so the boundary points one way", () => {
    for (const file of files) {
      for (const mod of importedModules(readFileSync(file, "utf8"))) {
        expect(mod.startsWith("@/server"), `${file} imports ${mod}`).toBe(false);
        expect(mod.includes("server/providers"), `${file} imports ${mod}`).toBe(false);
      }
    }
  });
});

describe("the adapter shells are typed seams, not integrations", () => {
  const files = sourceFiles(PROVIDERS_DIR);

  it("has adapter files to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it("makes no network call in any adapter file", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/(?<![\w.$])fetch\s*\(/);
      expect(source, file).not.toMatch(/\bXMLHttpRequest\b/);
      for (const mod of importedModules(source)) {
        expect(FORBIDDEN_MODULES, `${file} imports ${mod}`).not.toContain(mod);
      }
    }
  });

  it("invents no provider endpoint, because no URL to a provider appears at all", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // A provider host in a shell file would be a fabricated endpoint.
      expect(source, file).not.toMatch(/https?:\/\/[^\s"'`]*\b(stripe|whop|toasttab)\b/i);
      expect(source, file).not.toMatch(/\/oauth\/(authorize|token)/);
      expect(source, file).not.toMatch(/\/v\d+\/(payment_intents|charges|payments|refunds)\b/);
    }
  });

  it("holds no credential, only a reference to one", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\bsk_(live|test)_/);
      expect(source, file).not.toMatch(/\bwhsec_/);
      expect(source, file).not.toMatch(/\bprocess\.env\b/);
    }
  });

  it("agrees with its own declaration: no adapter claims to make network requests", () => {
    for (const a of PAYMENT_ADAPTERS) expect(a.makesNetworkRequests).toBe(false);
  });
});
