/**
 * Bounded property runs (fixed numRuns) take a few seconds alone but several times longer
 * while the whole suite shares the CPU; Vitest's 5 s default made them fail by contention.
 * A hang still fails: the budget is a ceiling, not a retry.
 */
export const PROPERTY_TIMEOUT = 30_000;
