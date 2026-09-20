/**
 * Barrel for the acceptance registries: numbered scenario text from a
 * specification, transcribed verbatim and graded against this repository.
 *
 * Pure data and pure functions. No React, no fetch, no clock. Nothing here
 * imports from src/domain, so the registry cannot accidentally start asserting
 * against the code it is supposed to grade from the outside.
 */
export * from "./paymentsV2";
