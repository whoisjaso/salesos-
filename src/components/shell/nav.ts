import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { ChartLineUp, House, UserCircle, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { SessionRole } from "@/lib/session";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
}

const REP_NAV: NavItem[] = [
  { href: "/", label: "Today", icon: House },
  { href: "/team", label: "Team", icon: UsersThree },
  { href: "/me", label: "Me", icon: UserCircle },
];

const OWNER_NAV: NavItem[] = [
  { href: "/", label: "Business", icon: ChartLineUp },
  { href: "/team", label: "Team", icon: UsersThree },
  { href: "/me", label: "Me", icon: UserCircle },
];

/** Exactly three tabs per role. */
export function navFor(role: SessionRole): NavItem[] {
  return role === "owner" ? OWNER_NAV : REP_NAV;
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
