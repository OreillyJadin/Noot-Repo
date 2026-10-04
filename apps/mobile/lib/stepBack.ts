// Where a tutor-application step's back arrow goes (ERR-020). Pure, so it's tested
// (apps/mobile/test/stepBack.test.ts).
//
// Walking the application forward stacks the steps, so back is an ordinary pop. Resuming a
// draft is different: "Continue where you left off" opens the first unfinished step directly
// on top of the intro screen, so a pop skipped every earlier step and landed back on the
// intro. A resumed step (?resumed=1) instead swaps itself for the step before it, carrying
// the flag along, until step 2 — whose back is the intro, as it always was.
export const FIRST_STEP = 2;

/** The route to replace the current step with, or null for an ordinary back. */
export function previousStepHref(step: number, resumed: boolean): string | null {
  if (!resumed || step <= FIRST_STEP) return null;
  return `/t${step - 1}?resumed=1`;
}
