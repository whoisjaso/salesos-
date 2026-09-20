/**
 * Profiles: the person behind the numbers. Source: docs/DECISIONS.md ("Make it fun: profiles and cards").
 *
 * A profile is presentation and identity. It never feeds routing, eligibility, or pay.
 * `howISell` is self-description (SOS-07: a rep's self-described style is not a proven ability).
 * Photos are tenant-private. Roles are owner-controlled and live on User, not here.
 */
import type { Id, ISODateTime, Role } from "./types";

export const ACCENTS = ["blue", "green", "amber", "rose", "violet", "teal", "orange", "slate"] as const;
export type Accent = (typeof ACCENTS)[number];

export interface Profile {
  tenantId: Id;
  userId: Id;
  displayName: string; // the name they go by
  handle: string; // lowercase, a-z 0-9 _ . , 3 to 20 chars, unique per tenant
  photo?: { dataUrl?: string; storageRef?: string; updatedAt: ISODateTime };
  accent: Accent;
  howISell?: string; // one line, max 80 chars, self-description
  hometown?: string;
  completedAt?: ISODateTime; // undefined until the person finishes setup
  updatedAt: ISODateTime;
}

export interface BusinessProfile {
  tenantId: Id;
  name: string;
  logo?: { dataUrl?: string; storageRef?: string; updatedAt: ISODateTime };
  timezone: string;
  currency: string;
  accent: Accent;
  updatedAt: ISODateTime;
}

export interface ProfileStore {
  get(tenantId: Id, userId: Id): Profile | undefined;
  list(tenantId: Id): Profile[];
  save(profile: Profile): { ok: true } | { ok: false; errors: string[] };
  getBusiness(tenantId: Id): BusinessProfile | undefined;
  saveBusiness(profile: BusinessProfile): { ok: true } | { ok: false; errors: string[] };
}

const HANDLE = /^[a-z0-9][a-z0-9._]{2,19}$/;

export function normalizeHandle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 20);
}

export function suggestHandle(displayName: string): string {
  const parts = displayName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const base = parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}` : (parts[0] ?? "rep");
  const h = normalizeHandle(base);
  return h.length >= 3 ? h : `${h}rep`.slice(0, 20);
}

export function validateProfile(p: Profile, existing: Profile[] = []): string[] {
  const errors: string[] = [];
  if (!p.displayName.trim() || p.displayName.trim().length > 40) errors.push("Name: 1 to 40 characters");
  if (!HANDLE.test(p.handle)) errors.push("Handle: 3 to 20 characters, letters, numbers, dots, underscores");
  if (existing.some((e) => e.tenantId === p.tenantId && e.userId !== p.userId && e.handle === p.handle)) errors.push("Handle taken");
  if (p.howISell && p.howISell.length > 80) errors.push("How I sell: 80 characters max");
  if (!ACCENTS.includes(p.accent)) errors.push("Pick a color");
  if (p.photo?.dataUrl && !/^data:image\/(png|jpeg|webp);base64,/.test(p.photo.dataUrl)) errors.push("Photo: PNG, JPEG, or WebP");
  if (p.photo?.dataUrl && p.photo.dataUrl.length > 1_400_000) errors.push("Photo: keep it under 1 MB");
  return errors;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function isComplete(p: Profile | undefined): boolean {
  return Boolean(p?.completedAt);
}

/** Deterministic accent for people who have not picked one yet. */
export function defaultAccent(userId: string): Accent {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function emptyProfile(tenantId: Id, userId: Id, displayName: string, now: ISODateTime): Profile {
  return {
    tenantId,
    userId,
    displayName,
    handle: suggestHandle(displayName),
    accent: defaultAccent(userId),
    updatedAt: now,
  };
}

/** A shareable card: identity plus the verified numbers the game already computes. Nothing self-reported. */
export interface RepCard {
  profile: Profile;
  role: Role;
  level: number;
  tierId: string;
  tierLabel: string;
  streakDays: number;
  seasonLabel: string;
  netCollectedMinor: number;
  currency: string;
  wins: number;
  attended: number;
  partner?: { userId: Id; displayName: string; role: Role };
}

export class MemoryProfileStore implements ProfileStore {
  private profiles = new Map<string, Profile>();
  private business = new Map<string, BusinessProfile>();
  constructor(seed: Profile[] = [], business: BusinessProfile[] = []) {
    for (const p of seed) this.profiles.set(`${p.tenantId}:${p.userId}`, p);
    for (const b of business) this.business.set(b.tenantId, b);
  }
  get(tenantId: Id, userId: Id) {
    return this.profiles.get(`${tenantId}:${userId}`);
  }
  list(tenantId: Id) {
    return [...this.profiles.values()].filter((p) => p.tenantId === tenantId);
  }
  save(profile: Profile) {
    const errors = validateProfile(profile, this.list(profile.tenantId));
    if (errors.length) return { ok: false as const, errors };
    this.profiles.set(`${profile.tenantId}:${profile.userId}`, profile);
    return { ok: true as const };
  }
  getBusiness(tenantId: Id) {
    return this.business.get(tenantId);
  }
  saveBusiness(profile: BusinessProfile) {
    if (!profile.name.trim()) return { ok: false as const, errors: ["Business name"] };
    this.business.set(profile.tenantId, profile);
    return { ok: true as const };
  }
}
