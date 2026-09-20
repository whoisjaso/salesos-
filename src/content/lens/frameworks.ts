/**
 * The owner's sales frameworks. Each entry composes into the lens pack
 * (src/domain/lens.ts, defaultLensPack) and into the system prompt the reasoning
 * model reads before it scores a transcript. See README.md in this folder.
 *
 * Content lives in src/content/frameworks (digested from docs/sources); study-only
 * material never reaches this list. Add more frameworks there, not here.
 */
import type { SalesFramework } from "@/domain/lens";
import { frameworkForLens } from "@/content/frameworks";

export const frameworks: SalesFramework[] = frameworkForLens();
