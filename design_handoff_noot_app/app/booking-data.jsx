// booking-data.jsx — demo data for the booking loop. Realistic enough that
// B1 filters/sort visibly change results. Swap for API data in the real build.

// 14-day window starting "today" (demo: anchored, not live Date math so it's stable)
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Anchor: "today" = Mon, Jun 16. Build 14 days.
function buildDays() {
  const start = new Date(2026, 5, 16); // Jun 16 2026 (Mon)
  const out = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      i, dow: DOW[d.getDay()], dom: d.getDate(), month: MONTHS[d.getMonth()],
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DOW[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return out;
}
const DAYS = buildDays();

// Per-tutor availability: map of dayIndex -> array of time-slot strings
function slotsFor(seed) {
  const pool = ['9:00 AM', '10:30 AM', '12:00 PM', '1:30 PM', '3:00 PM', '4:30 PM', '6:00 PM', '7:30 PM'];
  const map = {};
  for (let d = 0; d < 14; d++) {
    if ((d + seed) % 7 === 3 || (d + seed) % 5 === 0) continue; // some days off
    const n = ((d * 7 + seed * 3) % 4) + 2;
    const start = (d + seed) % 3;
    map[d] = pool.filter((_, idx) => idx >= start).slice(0, n);
  }
  return map;
}

const REVIEWS_POOL = [
  { name: 'Jordan M.', course: 'MGT 300', rating: 5, when: '2 weeks ago', text: 'Explained the case-study framework better than the professor. Walked out actually understanding Porter\'s Five Forces.' },
  { name: 'Priya S.', course: 'MGT 300', rating: 5, when: '3 weeks ago', text: 'Super patient and great with exam prep. We did three practice problems and I nailed the midterm.' },
  { name: 'Chris D.', course: 'MGT 301', rating: 4, when: 'Last month', text: 'Knows the material cold. A little fast at first but slowed down when I asked.' },
  { name: 'Mariah T.', course: 'MGT 300', rating: 5, when: 'Last month', text: 'Met me at Gorgas and we went through the whole study guide. Booked again the next week.' },
  { name: 'Sam W.', course: 'MGT 300', rating: 5, when: '5 weeks ago', text: 'Took the same class with the same prof, so the tips were exactly on point.' },
];

const TUTORS = [
  { id: 'sara',  name: 'Sara W.',   year: 'Senior',  major: 'Management',  rating: 4.9, sessions: 48, rate: 28, gender: 'f', verified: 'A',  next: 0, nextLabel: 'Today 3:00 PM',
    bio: 'Senior in Management, minoring in Econ. I took MGT 300 with Prof. Reynolds and pulled an A — I know exactly what shows up on his exams. I focus on the case frameworks and make them stick.',
    courses: [['MGT 300', 'A', 28, 48], ['MGT 301', 'A-', 26, 12], ['EC 110', 'A', 22, 9]] },
  { id: 'devon', name: 'Devon R.',  year: 'Grad',    major: 'MBA',         rating: 5.0, sessions: 71, rate: 34, gender: 'm', verified: 'A',  next: 1, nextLabel: 'Tomorrow 10:30 AM',
    bio: 'First-year MBA and former undergrad TA for MGT 300. I\'ve coached 70+ sessions on this exact course. Strong on strategy frameworks, financial ratios, and exam timing.',
    courses: [['MGT 300', 'A', 34, 52], ['MGT 410', 'A', 38, 19]] },
  { id: 'maya',  name: 'Maya P.',   year: 'Junior',  major: 'Marketing',   rating: 4.8, sessions: 23, rate: 22, gender: 'f', verified: 'A-', next: 0, nextLabel: 'Today 6:00 PM',
    bio: 'Junior in Marketing. MGT 300 clicked for me once I stopped memorizing and started drawing the frameworks out. I\'ll show you how. Friendly, no-judgment sessions.',
    courses: [['MGT 300', 'A-', 22, 18], ['MKT 300', 'A', 24, 14]] },
  { id: 'alex',  name: 'Alex J.',   year: 'Senior',  major: 'Finance',     rating: 4.7, sessions: 31, rate: 25, gender: 'm', verified: 'A',  next: 2, nextLabel: 'Wed 1:30 PM',
    bio: 'Finance senior. I tutor MGT 300 and the quantitative side of the business core. Great if you want to drill practice problems before an exam.',
    courses: [['MGT 300', 'A', 25, 21], ['FI 302', 'A', 30, 16]] },
  { id: 'nina',  name: 'Nina K.',   year: 'Grad',    major: 'Management',  rating: 4.9, sessions: 56, rate: 30, gender: 'f', verified: 'A',  next: 3, nextLabel: 'Thu 9:00 AM',
    bio: 'PhD student in Management and current MGT 300 lab instructor. I teach this material every semester — I can demystify any topic on the syllabus.',
    courses: [['MGT 300', 'A', 30, 44], ['MGT 486', 'A', 40, 12]] },
  { id: 'kofi',  name: 'Kofi A.',   year: 'Junior',  major: 'Economics',   rating: 4.6, sessions: 14, rate: 19, gender: 'm', verified: 'B+', next: 1, nextLabel: 'Tomorrow 4:30 PM',
    bio: 'Econ junior, newer tutor but I love teaching. Affordable rate while I build up reviews. Patient and thorough — we\'ll go at your pace.',
    courses: [['MGT 300', 'B+', 19, 11], ['EC 111', 'A', 20, 8]] },
];

function tutorById(id) { return TUTORS.find(t => t.id === id); }
function reviewsFor(course) { return REVIEWS_POOL; }

Object.assign(window, { TUTORS, DAYS, DOW, MONTHS, slotsFor, tutorById, reviewsFor, REVIEWS_POOL });
