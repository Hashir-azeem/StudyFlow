import type { AssessmentFlag, WeightCheck } from "./types";

/** Items that make up the 100%: not bonus/optional, not a dropped "best N of M" item. */
export function countsTowardTotal(a: { optional: boolean; flags: readonly AssessmentFlag[] }): boolean {
  return !a.optional && !a.flags.includes("dropped");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Verify counted weights against 100%. Used on the parse result and again,
 * live, on whatever the student has ticked and edited in the review screen.
 */
export function checkWeights(
  items: ReadonlyArray<{ weight: number | null; optional: boolean; flags: readonly AssessmentFlag[] }>,
  declaredTotal: number | null = null,
): WeightCheck {
  const total = round2(items.filter(countsTowardTotal).reduce((sum, a) => sum + (a.weight ?? 0), 0));
  const difference = round2(total - 100);
  const status = total === 0 ? "none" : Math.abs(difference) <= 0.01 ? "exact" : difference > 0 ? "over" : "under";
  return { total, declaredTotal, status, difference };
}
