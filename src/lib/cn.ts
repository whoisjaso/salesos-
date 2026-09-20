import { clsx, type ClassValue } from "clsx";

/** Class name helper. Thin clsx wrapper so call sites stay short. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
