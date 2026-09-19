import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  BookOpenText,
  ChalkboardTeacher,
  ChartLineUp,
  Handshake,
  PhoneCall,
  SquaresFour,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

export interface NavItem {
  href: string;
  label: string;
  /** One short word for the phone tab bar. */
  shortLabel: string;
  icon: ComponentType<IconProps>;
  /** Shown in the phone tab bar. Max five. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Command", shortLabel: "Home", icon: SquaresFour, primary: true },
  { href: "/owner", label: "Owner", shortLabel: "Owner", icon: ChartLineUp, primary: true },
  { href: "/setter", label: "Setter", shortLabel: "Setter", icon: PhoneCall, primary: true },
  { href: "/closer", label: "Closer", shortLabel: "Closer", icon: Handshake, primary: true },
  { href: "/team", label: "Team", shortLabel: "Team", icon: UsersThree },
  { href: "/coach", label: "Coach", shortLabel: "Coach", icon: ChalkboardTeacher, primary: true },
  { href: "/playbooks", label: "Playbooks", shortLabel: "Playbooks", icon: BookOpenText },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
