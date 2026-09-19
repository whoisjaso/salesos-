"use client";

/**
 * Client profile store: the person behind the numbers (docs/DECISIONS.md,
 * "Make it fun: profiles and cards"). Backed by MemoryProfileStore, seeded
 * with an empty profile per active user, persisted to localStorage under
 * "sos-profiles". Mirrors the storage pattern in src/lib/session.tsx.
 *
 * Presentation only. Nothing here feeds routing, eligibility, or pay.
 */
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  type Accent,
  type BusinessProfile,
  type Profile,
  MemoryProfileStore,
  emptyProfile,
  validateProfile,
} from "@/domain/profile";
import { obaviaDataset } from "@/fixtures/obavia";

export const PROFILES_KEY = "sos-profiles";

const TENANT_ID = obaviaDataset.tenant.tenantId;
const SEED_NOW = "2026-01-01T00:00:00Z";

/** One hex per accent. Chosen to read on both themes as a ring and, mixed with the foreground, as initials. */
export const ACCENT_HEX: Record<Accent, string> = {
  blue: "#7ba4f0",
  green: "#86c7a2",
  amber: "#d9b878",
  rose: "#e08a9b",
  violet: "#b39ceb",
  teal: "#6cc4c4",
  orange: "#e5a06b",
  slate: "#a7a59d",
};

export const ACCENT_WORD: Record<Accent, string> = {
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  rose: "Rose",
  violet: "Violet",
  teal: "Teal",
  orange: "Orange",
  slate: "Slate",
};

export function seedProfiles(): Profile[] {
  return obaviaDataset.users.filter((u) => u.active).map((u) => emptyProfile(TENANT_ID, u.userId, u.displayName, SEED_NOW));
}

export function seedBusiness(): BusinessProfile {
  return {
    tenantId: TENANT_ID,
    name: "Obavia",
    timezone: obaviaDataset.tenant.timezone,
    currency: obaviaDataset.tenant.reportingCurrency,
    accent: "blue",
    updatedAt: SEED_NOW,
  };
}

interface Stored {
  profiles?: Partial<Profile>[];
  business?: Partial<BusinessProfile>;
}

interface Snapshot {
  profiles: Profile[];
  business: BusinessProfile;
}

const EVENT = "sos-profiles-change";
const LOADING = "loading" as const;

let store: MemoryProfileStore | null = null;
let cached: Snapshot | undefined;

function buildStore(): MemoryProfileStore {
  const seeds = seedProfiles();
  const s = new MemoryProfileStore(seeds, [seedBusiness()]);
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Stored;
      for (const p of parsed.profiles ?? []) {
        const seed = seeds.find((x) => x.userId === p.userId);
        // People who joined through onboarding have no seed; their stored profile stands on its own.
        const base = seed ?? (typeof p.userId === "string" && typeof p.displayName === "string" ? emptyProfile(TENANT_ID, p.userId, p.displayName, SEED_NOW) : null);
        if (!base) continue;
        const merged: Profile = { ...base, ...p, tenantId: base.tenantId, userId: base.userId } as Profile;
        if (validateProfile(merged, []).length === 0) s.save(merged);
      }
      if (parsed.business) s.saveBusiness({ ...seedBusiness(), ...parsed.business, tenantId: TENANT_ID } as BusinessProfile);
    }
  } catch {
    /* storage unavailable or corrupt: seeds apply */
  }
  return s;
}

function getStore(): MemoryProfileStore {
  if (!store) store = buildStore();
  return store;
}

function persist(s: MemoryProfileStore) {
  try {
    const stored: Stored = {
      profiles: s.list(TENANT_ID).filter((p) => p.updatedAt !== SEED_NOW),
      business: s.getBusiness(TENANT_ID),
    };
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable or full: the profile still applies for this page */
  }
}

function snapshotOf(s: MemoryProfileStore): Snapshot {
  return { profiles: s.list(TENANT_ID), business: s.getBusiness(TENANT_ID) ?? seedBusiness() };
}

function getSnapshot(): Snapshot {
  if (cached === undefined) cached = snapshotOf(getStore());
  return cached;
}

function getServerSnapshot(): typeof LOADING {
  return LOADING;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PROFILES_KEY) {
      store = null;
      cached = undefined;
      onChange();
    }
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  cached = undefined;
  window.dispatchEvent(new Event(EVENT));
}

export type SaveResult = { ok: true } | { ok: false; errors: string[] };

export interface ProfilesContextValue {
  /** The profile for a user; an empty seed profile while loading or for unknown ids. */
  get: (userId: string) => Profile;
  list: () => Profile[];
  save: (profile: Profile) => SaveResult;
  business: BusinessProfile;
  saveBusiness: (profile: BusinessProfile) => SaveResult;
  /** False until localStorage has been read on the client. */
  ready: boolean;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

const SEED_SNAPSHOT: Snapshot = { profiles: seedProfiles(), business: seedBusiness() };

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore<Snapshot | typeof LOADING>(subscribe, getSnapshot, getServerSnapshot);
  const ready = snapshot !== LOADING;
  const current = ready ? snapshot : SEED_SNAPSHOT;

  const get = useCallback(
    (userId: string) => current.profiles.find((p) => p.userId === userId) ?? emptyProfile(TENANT_ID, userId, userId, SEED_NOW),
    [current],
  );
  const list = useCallback(() => current.profiles, [current]);
  const save = useCallback((profile: Profile): SaveResult => {
    const s = getStore();
    const result = s.save(profile);
    if (result.ok) {
      persist(s);
      notify();
    }
    return result;
  }, []);
  const saveBusiness = useCallback((profile: BusinessProfile): SaveResult => {
    const s = getStore();
    const result = s.saveBusiness(profile);
    if (result.ok) {
      persist(s);
      notify();
    }
    return result;
  }, []);

  const value = useMemo<ProfilesContextValue>(
    () => ({ get, list, save, business: current.business, saveBusiness, ready }),
    [get, list, save, current.business, saveBusiness, ready],
  );
  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles(): ProfilesContextValue {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error("useProfiles must be used inside ProfilesProvider");
  return ctx;
}

/** Wall clock for profile stamps. Client code only; domain code takes `now` injected. */
export function clientNow(): string {
  return new Date().toISOString();
}

export const PHOTO_SIDE = 512;

/**
 * Downscale a picked image in the browser to a 512x512 JPEG (cover crop, quality 0.85)
 * so the stored data URL stays well under 1 MB.
 */
export async function shrinkPhoto(file: File, side = PHOTO_SIDE): Promise<string> {
  const source = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const w = source.width;
  const h = source.height;
  const crop = Math.min(w, h);
  const sx = (w - crop) / 2;
  const sy = (h - crop) / 2;
  ctx.drawImage(source, sx, sy, crop, crop, 0, 0, side, side);
  if ("close" in source && typeof source.close === "function") source.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the img element path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
