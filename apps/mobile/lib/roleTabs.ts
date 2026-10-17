// Which modes the profile switcher offers. Pure, so the rules are unit-tested
// (test/roleTabs.test.ts) without rendering a screen.
//
// The switcher shows what you ARE, not every mode noot has. Becoming a tutor or an ambassador
// starts from the cards at the bottom of Profile, not from a tab you haven't earned:
//   • tutor — appears once the application is SUBMITTED (pending). It's a preview until an
//     admin approves it, and that's still worth a tab: a pending tutor can set rates and
//     availability so they're bookable the moment they're approved. A draft or a rejected
//     application gets no tab; the "Finish / apply again" card handles both.
//   • ambassador — appears once the role is held (it's self-serve, so joining grants it).
//   • whichever mode you're in right now is always kept, even if you don't qualify for it
//     any more (e.g. rejected while viewing Tutor mode), so there's always a way back.
import type { Role } from './store';
import type { TutorStatus } from './useMe';

export function previewRolesFor(held: Role[], active: Role, tutorStatus: TutorStatus): Role[] {
  return (['tutor', 'ambassador'] as Role[]).filter(
    (r) => !held.includes(r) && (r === active || (r === 'tutor' && tutorStatus === 'pending')),
  );
}

/**
 * Whether switching to `next` is only a preview (nothing saved to users.active_role).
 * `granted` lists roles the caller has just been given, which the loaded profile may not
 * show yet — e.g. "Become an ambassador" adds the role and switches in the same tap.
 */
export function isPreviewSwitch(held: Role[], next: Role, granted: Role[] = []): boolean {
  return !held.includes(next) && !granted.includes(next);
}

/**
 * Whether the mode on screen should now be saved as users.active_role: it was a preview a
 * moment ago (`wasPreview`), the user holds that role now (e.g. their tutor application was
 * approved while they were previewing Tutor mode), and it isn't saved yet.
 */
export function shouldSaveHeldMode(wasPreview: boolean, held: Role[], active: Role, saved: Role): boolean {
  return wasPreview && held.includes(active) && saved !== active;
}

/**
 * ERR-025: whether Profile shows its referral card. Not in ambassador mode — the Referrals
 * tab already sits in that mode's tab bar. Student mode keeps it, including for an ambassador
 * viewing as a student, since that tab bar has no Referrals tab. (Tutor mode has its own
 * profile screen, which never had the card.)
 */
export function showsReferCard(active: Role): boolean {
  return active !== 'ambassador';
}
