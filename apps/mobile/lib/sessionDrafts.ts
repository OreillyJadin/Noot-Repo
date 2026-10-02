// Suggested first messages for a tutor after a session is booked (tracker B2).
//
// Shown as chips above the tutor's empty chat composer. Tapping one fills the composer —
// nothing is ever sent automatically, so every draft stays the tutor's own message. The
// location draft is the important one: a booked session only knows the building ("Gorgas
// Library"), and the student needs the exact spot — a booked room, a floor, an area.
// [Bracketed] parts are for the tutor to fill in. Pure, so it's unit-tested.

export interface DraftContext {
  studentFirstName: string;
  tutorFirstName: string;
  course: string;
  /** The booking's location label, e.g. "Gorgas Library", "Other — I'll suggest", or empty. */
  location: string;
  /** "Thursday at 3:00 PM"-style, or empty when unknown. */
  when: string;
}

export interface SessionDraft {
  key: 'location' | 'intro' | 'bring';
  label: string;
  text: string;
}

/** "Other — I'll suggest" is the booking flow's placeholder, not a place. */
function isRealPlace(location: string): boolean {
  const l = location.trim();
  return !!l && !/^other\b/i.test(l) && !/^online\b/i.test(l);
}

export function tutorSessionDrafts(c: DraftContext): SessionDraft[] {
  const hi = c.studentFirstName ? `Hi ${c.studentFirstName}!` : 'Hi!';
  const session = `our ${c.course ? `${c.course} ` : ''}session${c.when ? ` ${c.when}` : ''}`;

  const location = isRealPlace(c.location)
    ? `${hi} For ${session}, let's meet at ${c.location.trim()}. I've booked [room number] — ` +
      `if that falls through I'll be at [floor / area]. Message me here if you can't find it.`
    : c.location.trim()
      ? `${hi} For ${session}, how about [library or hall]? I'll book [room number], or we can meet at ` +
        `[floor / area]. Let me know if somewhere else works better for you.`
      : `${hi} Where works best for ${session}? I'm thinking [library or hall], in [room number or area].`;

  return [
    { key: 'location', label: 'Confirm meeting spot', text: location },
    {
      key: 'intro',
      label: 'Say hi + what to cover',
      text:
        `${hi} I'm ${c.tutorFirstName || 'your tutor'} — looking forward to ${session}. ` +
        `Anything specific you want to focus on? A topic, homework, or an upcoming exam?`,
    },
    {
      key: 'bring',
      label: 'What to bring',
      text:
        `${hi} To make the most of ${session}, bring your notes, the problems you're stuck on, and ` +
        `[anything else]. See you then!`,
    },
  ];
}
