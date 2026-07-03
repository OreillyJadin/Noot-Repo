// screens-map.jsx — SINGLE SOURCE OF TRUTH for page identity + navigation.
// Every screen the router can show is listed here exactly once.
//   key   : the route key passed to go(key) / used in U_REG (tc-app.jsx)
//   code  : short stable page code (matches product specs: O*, B*, T*, C*, TB*, X*)
//   name  : human-readable page name (use this in designs, docs, conversation)
//   flow  : which journey it belongs to
//   file  : source file the component lives in
//   comp  : component name on window
//   to    : outbound navigation — [destinationKey, trigger label]. back() is implicit everywhere.
//   tabs  : true if it's a bottom-tab destination (TabBar persists across these)
//
// This object drives the corner label + Jump-to launcher, and is the contract
// Claude Code should read to wire real navigation. Keep it in sync with the screens.

window.SCREENS = {
  // ── ONBOARDING ────────────────────────────────────────────────────────────
  landing:        { code: 'O1', name: 'Welcome / Landing',        flow: 'Onboarding', file: 'screens-shared.jsx',  comp: 'Landing',
                    to: [['signup', 'Log in / Sign up']] },
  signup:         { code: 'O2', name: 'Sign Up (.edu Email)',     flow: 'Onboarding', file: 'screens-shared.jsx',  comp: 'SignUp',
                    to: [['verified', 'Open magic link']] },
  verified:       { code: 'O3', name: 'Email Verified',           flow: 'Onboarding', file: 'screens-shared.jsx',  comp: 'Verified',
                    to: [['role', "Let's go"]] },
  role:           { code: 'O4', name: 'Choose Your Role',         flow: 'Onboarding', file: 'screens-shared.jsx',  comp: 'Role',
                    to: [['student_profile', "I'm a student"], ['t1', 'I want to tutor']] },

  // ── STUDENT · SETUP & HOME ─────────────────────────────────────────────────
  student_profile:{ code: 'S1', name: 'Student Profile Setup',    flow: 'Student', file: 'screens-student.jsx', comp: 'StudentProfile',
                    to: [['home', 'Complete profile']] },
  home:           { code: 'S2', name: 'Student Home (For You)',   flow: 'Student', file: 'screens-home.jsx', comp: 'StudentHomeFeed', tabs: true,
                    to: [['b2', 'Continue with tutor'], ['sessions', 'Session details'], ['student_home', 'Browse']] },
  student_home:   { code: 'S3', name: 'Search / Browse',          flow: 'Student', file: 'screens-student.jsx', comp: 'StudentHome', tabs: true,
                    to: [['b1', 'Search'], ['b2', 'Tap a tutor']] },

  // ── STUDENT · BOOKING LOOP ─────────────────────────────────────────────────
  b1:             { code: 'B1', name: 'Search Results',           flow: 'Booking', file: 'screens-booking.jsx',  comp: 'B1',
                    to: [['b2', 'Open tutor']] },
  b2:             { code: 'B2', name: 'Tutor Profile',            flow: 'Booking', file: 'screens-booking.jsx',  comp: 'B2',
                    to: [['b3', 'Book a session']] },
  b3:             { code: 'B3', name: 'Select Session',           flow: 'Booking', file: 'screens-booking2.jsx', comp: 'B3',
                    to: [['b4', 'Continue to payment']] },
  b4:             { code: 'B4', name: 'Payment',                  flow: 'Booking', file: 'screens-booking2.jsx', comp: 'B4',
                    to: [['b5', 'Pay → on success']] },
  b5:             { code: 'B5', name: 'Booking Confirmed',        flow: 'Booking', file: 'screens-booking2.jsx', comp: 'B5',
                    to: [['home', 'Done']] },

  // ── STUDENT · TABS ─────────────────────────────────────────────────────────
  saved:          { code: 'S4', name: 'Saved (now inside Sessions)', flow: 'Student tabs', file: 'screens-tabs.jsx', comp: 'SavedTab', tabs: true,
                    to: [['b2', 'Open tutor']] },
  sessions:       { code: 'S5', name: 'My Sessions',              flow: 'Student tabs', file: 'screens-tabs.jsx', comp: 'SessionsTab', tabs: true,
                    to: [['c1', 'Rate a session'], ['xsr', 'Reschedule'], ['chat', 'Message'], ['b3', 'Book again']] },
  profile:        { code: 'S6', name: 'My Profile',               flow: 'Student tabs', file: 'screens-tabs.jsx', comp: 'ProfileTab', tabs: true,
                    to: [['edit_personal', 'Personal info'], ['edit_courses', 'My courses'], ['t1', 'Become a tutor'], ['home', 'Switch to student'], ['landing', 'Sign out']] },

  // ── PROFILE EDITING (settings-style, not onboarding) ────────────────────
  edit_personal:  { code: 'P1', name: 'Edit Personal Info',       flow: 'Edit profile', file: 'screens-edit.jsx', comp: 'EditPersonal',
                    to: [['profile', 'Save → back']] },
  edit_courses:   { code: 'P2', name: 'My Courses (Edit)',        flow: 'Edit profile', file: 'screens-edit.jsx', comp: 'EditCourses',
                    to: [['profile', 'Save → back']] },
  edit_tutor:     { code: 'P3', name: 'Edit Tutor Profile',       flow: 'Edit profile', file: 'screens-edit.jsx', comp: 'EditTutorProfile',
                    to: [['b2', 'Preview public profile'], ['tutor_profile', 'Save → back']] },
  edit_rates:     { code: 'P4', name: 'Courses & Rates (Edit)',   flow: 'Edit profile', file: 'screens-edit.jsx', comp: 'EditRates',
                    to: [['t3', 'Add a course'], ['tutor_profile', 'Save → back']] },
  edit_availability: { code: 'P5', name: 'Set Availability (Edit)', flow: 'Edit profile', file: 'screens-edit.jsx', comp: 'EditAvailability',
                    to: [['tutor_calendar', 'Open Calendar'], ['tutor_profile', 'Save → back']] },

  // ── MESSAGING ──────────────────────────────────────────────────────────────
  chat:           { code: 'M1', name: 'Chat (Student view)',      flow: 'Messaging', file: 'screens-chat.jsx', comp: 'Chat',
                    to: [] },
  chat_tutor:     { code: 'M2', name: 'Chat (Tutor view)',        flow: 'Messaging', file: 'screens-chat.jsx', comp: 'ChatTutor',
                    to: [] },

  // ── TUTOR · APPLICATION (10 steps) ─────────────────────────────────────────
  t1:  { code: 'T1',  name: 'Become a Tutor',          flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T1',  to: [['t2', 'Get started']] },
  t2:  { code: 'T2',  name: 'Tutor Profile',           flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T2',  to: [['t3', 'Save & continue'], ['landing', 'Save & exit']] },
  t3:  { code: 'T3',  name: 'Courses You Tutor',       flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T3',  to: [['t4', 'Save & continue'], ['landing', 'Save & exit']] },
  t4:  { code: 'T4',  name: 'Set Your Rates',          flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T4',  to: [['t5', 'Save & continue'], ['landing', 'Save & exit']] },
  t5:  { code: 'T5',  name: 'Set Availability',        flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T5',  to: [['t6', 'Save & continue'], ['landing', 'Save & exit']] },
  t6:  { code: 'T6',  name: 'Verify Grades',           flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T6',  to: [['t7', 'Submit for review'], ['landing', 'Save & exit']] },
  t7:  { code: 'T7',  name: 'Tutor Agreement',         flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T7',  to: [['t8', 'Sign & continue'], ['landing', 'Save & exit']] },
  t8:  { code: 'T8',  name: 'Payout Setup (Stripe)',   flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T8',  to: [['t9', 'Continue with Stripe'], ['landing', 'Save & exit']] },
  t9:  { code: 'T9',  name: 'Review Profile',          flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T9',  to: [['t10', 'Submit for review']] },
  t10: { code: 'T10', name: 'Application In Review',   flow: 'Tutor setup', file: 'screens-tutor.jsx', comp: 'T10', to: [['tutor_home', 'Go to dashboard']] },

  // ── TUTOR · HOME & SESSIONS ────────────────────────────────────────────────
  tutor_home:     { code: 'TH', name: 'Tutor Home (Dashboard)',   flow: 'Tutor home', file: 'screens-home.jsx', comp: 'TutorHome', tabs: true,
                    to: [['tb2', 'Session details'], ['chat_tutor', 'Message'], ['edit_availability', 'Set availability'], ['edit_rates', 'Adjust rates'], ['edit_tutor', 'Edit profile']] },
  tutor_calendar: { code: 'TC', name: 'Tutor Calendar',          flow: 'Tutor home', file: 'screens-calendar.jsx', comp: 'TutorCalendar', tabs: true,
                    to: [['tb2', 'Open session']] },
  tutor_sessions: { code: 'TS', name: 'Tutor Sessions',          flow: 'Tutor home', file: 'screens-home.jsx', comp: 'TutorSessions', tabs: true,
                    to: [['tb2', 'Open session']] },
  tutor_profile:  { code: 'TP', name: 'Tutor Profile',           flow: 'Tutor home', file: 'screens-tabs.jsx', comp: 'ProfileTabTutor', tabs: true,
                    to: [['edit_personal', 'Personal info'], ['edit_rates', 'Courses & rates'], ['edit_availability', 'Availability'], ['edit_tutor', 'Edit tutor profile'], ['home', 'Switch to student'], ['landing', 'Sign out']] },

  // ── TUTOR · INCOMING SESSIONS ──────────────────────────────────────────────
  tb1: { code: 'TB1', name: 'New Booking Alert',       flow: 'Tutor sessions', file: 'screens-tutorside.jsx', comp: 'TB1', to: [['tb2', 'View session details']] },
  tb2: { code: 'TB2', name: 'Session Detail (Tutor)',  flow: 'Tutor sessions', file: 'screens-tutorside.jsx', comp: 'TB2', to: [['xtr', 'Reschedule'], ['xtc', 'Cancel']] },

  // ── AFTER THE SESSION ──────────────────────────────────────────────────────
  c1: { code: 'C1', name: 'Session Completion Prompt', flow: 'Completion', file: 'screens-completion.jsx', comp: 'C1', to: [['c2', 'As student'], ['c3', 'As tutor']] },
  c2: { code: 'C2', name: 'Student Rates Tutor',       flow: 'Completion', file: 'screens-completion.jsx', comp: 'C2', to: [['c4', 'Submit']] },
  c3: { code: 'C3', name: 'Tutor Rates Student',       flow: 'Completion', file: 'screens-completion.jsx', comp: 'C3', to: [['c4', 'Submit']] },
  c4: { code: 'C4', name: 'Feedback Confirmation',     flow: 'Completion', file: 'screens-completion.jsx', comp: 'C4', to: [['home', 'Done']] },

  // ── CHANGES & EXCEPTIONS ───────────────────────────────────────────────────
  xsc: { code: 'X1', name: 'Cancel Session (Student)',   flow: 'Exceptions', file: 'screens-changes.jsx', comp: 'XStudentCancel',     to: [['home', 'Done']] },
  xtc: { code: 'X2', name: 'Cancel Session (Tutor)',     flow: 'Exceptions', file: 'screens-changes.jsx', comp: 'XTutorCancel',       to: [['xtr', 'Reschedule instead'], ['home', 'Cancel & refund']] },
  xtr: { code: 'X3', name: 'Propose Reschedule (Tutor)', flow: 'Exceptions', file: 'screens-changes.jsx', comp: 'XReschedulePropose', to: [['xsr', "See student's view"]] },
  xsr: { code: 'X4', name: 'Reschedule Request (Student)', flow: 'Exceptions', file: 'screens-changes.jsx', comp: 'XRescheduleRequest', to: [['home', 'Accept / decline → done']] },
  xns: { code: 'X5', name: 'Report No-Show',             flow: 'Exceptions', file: 'screens-changes.jsx', comp: 'XNoShow',            to: [['home', 'Done']] },
};

// alias: none — 'home' is now its own screen (StudentHomeFeed)

// Ordered flow groups (for sitemap + launcher rendering)
window.SCREEN_FLOWS = ['Onboarding', 'Student', 'Booking', 'Student tabs', 'Edit profile', 'Messaging', 'Tutor setup', 'Tutor home', 'Tutor sessions', 'Completion', 'Exceptions'];

// helper
window.screenLabel = (key) => {
  const s = window.SCREENS[key];
  return s ? `${s.code} · ${s.name}` : key;
};
