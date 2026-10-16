// Picks the booking for the student home "next session" card. `bookings` is
// already sorted soonest-first (listUpcoming order): take the first confirmed
// session; if there is none, surface the first pending request so the student
// sees their outstanding request instead of the empty-state CTA.
export function pickStudentNext<T extends { status: string }>(bookings: T[]): T | null {
  return bookings.find((b) => b.status === 'confirmed') ?? bookings.find((b) => b.status === 'pending') ?? null;
}
