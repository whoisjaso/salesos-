/**
 * The owner's sales frameworks. Each entry composes into the lens pack
 * (src/domain/lens.ts, defaultLensPack) and into the system prompt the reasoning
 * model reads before it scores a transcript. See README.md in this folder.
 *
 * Empty on purpose: no framework content is invented here. The owner adds their own.
 */
import type { SalesFramework } from "@/domain/lens";

export const frameworks: SalesFramework[] = [
  // Example shape (keep commented until the owner supplies real content):
  // {
  //   name: "Framework name",
  //   source: "Book, course, or 'owner notes'",
  //   principles: ["One principle per line, in the owner's words"],
  //   doNots: ["One boundary per line"],
  // },
];
