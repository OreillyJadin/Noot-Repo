// legal/COMMUNITY_GUIDELINES.md is the reviewable copy. Change both together and bump this
// version on a material change: every account is asked to agree again, once.
export const GUIDELINES_VERSION = '2026-10-17';

/**
 * Whether an account's recorded acceptance covers the current guidelines. Versions are ISO
 * dates, so an acceptance of a newer version (recorded by a newer build) still counts.
 */
export function guidelinesAreCurrent(acceptedAt: string | null, version: string | null): boolean {
  return acceptedAt != null && version != null && /^\d{4}-\d{2}-\d{2}$/.test(version) && version >= GUIDELINES_VERSION;
}

export function splitGuidelineBody(section: { body: string[]; bullets?: string[] }): { before: string[]; after: string[] } {
  return section.bullets
    ? { before: section.body.slice(0, 1), after: section.body.slice(1) }
    : { before: section.body, after: [] };
}

export const GUIDELINES: { title: string; body: string[]; bullets?: string[] }[] = [
  {
    title: '',
    body: [
      'noot works because students trust each other: students trust their tutor to show up and help them learn, and tutors trust their students to show up, pay, and treat them with respect. These guidelines are the promises everyone on noot makes — students, tutors and ambassadors — and they apply whichever side of the app you are using. They sit alongside our Terms of Use; if the two ever disagree, the Terms win.',
    ],
  },
  {
    title: '1. Be yourself',
    body: ["Use your real name and your own university email. One person, one account. Don't share your account, or book or tutor on someone else's behalf."],
  },
  {
    title: '2. Treat everyone with respect',
    body: [
      'noot has zero tolerance for objectionable content and abusive behavior. No harassment, bullying, threats, hate, discrimination, or sexual comments or content — in messages, in reviews, or in person.',
    ],
  },
  {
    title: "3. Learn, don't cheat",
    body: [
      "Tutoring is for understanding the material. Don't ask a tutor to take a quiz or exam for you, do graded work you'll hand in as your own, or share answers or materials your professor hasn't allowed. Tutors can say no, and we remove accounts that ask. If you tutor, don't do any of this for a student, even when asked.",
    ],
  },
  {
    title: '4. Show up, or cancel early',
    body: [
      'Whoever you are meeting holds that time for you. If you are the student and plans change, cancel in the app as early as you can:',
      "If you are the tutor, cancel only when you have to, and as early as you can: your student gets a full refund and you aren't paid for that session.",
      "Repeated no-shows can cost you refund eligibility or your account. If there's a real emergency, message the other person or email us — we'd rather hear from you.",
    ],
    bullets: [
      '12 or more hours before: full refund.',
      '2 to 12 hours before: 50% refund — your tutor is paid for the other half.',
      'Under 2 hours before, or a no-show: no refund — your tutor is paid for the session.',
    ],
  },
  {
    title: '5. Keep it on noot',
    body: [
      "Book and pay for every session in the app, and keep your conversations in noot chat. Paying a tutor, or taking payment from a student, outside noot removes your refund, dispute and safety protections, and it's against the rules for both of you.",
    ],
  },
  {
    title: '6. Meet safely',
    body: [
      "Meet in a public place on campus — a library, the student center, a study room. Tell a friend where you'll be. If anything feels wrong, leave. In an emergency, call 911 first.",
    ],
  },
  {
    title: '7. Respect privacy',
    body: [
      "Don't share another person's phone number, photos, messages or other personal information, and don't record a session without the other person's permission.",
    ],
  },
  {
    title: '8. Review honestly',
    body: [
      'Rate the session you actually had. No fake reviews, no reviews in exchange for discounts or favors, and no reviews written to get back at someone.',
    ],
  },
  {
    title: '9. Speak up',
    body: [
      'If someone breaks these guidelines, tell us:',
      'Our team reviews every report within 24 hours. Reports must be made in good faith — knowingly false reports break these guidelines too.',
    ],
    bullets: [
      'press and hold a message to report it;',
      'tap ⋯ at the top of a chat to report or block someone; and',
      'email admin@trynoot.com about anything else.',
    ],
  },
  {
    title: 'What happens if you break them',
    body: [
      'Depending on what happened, we may remove content, warn you, limit your account, cancel bookings, or suspend or permanently ban your account.',
    ],
  },
];
