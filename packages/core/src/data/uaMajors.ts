// University of Alabama undergraduate majors (tracker ST1 / D3).
//
// SOURCE: https://catalog.ua.edu/programs/ filtered to Undergraduate + Major, pulled
// 2026-09-23 (100 programs). Degree suffixes are dropped and duplicates merged — "Theatre, BA"
// and "Theatre, BFA" are one major to a student — which leaves 91. "Undeclared" is added by
// hand. `college` is the offering college; Economics is offered by two and lists the first.
//
// Static on purpose: this changes once a year at most. To refresh, re-run the same filter
// and regenerate this list — nothing else depends on its order.
export interface Major {
  name: string;
  college: string;
}

export const UA_MAJORS: readonly Major[] = [
  { name: "Undeclared", college: "" },
  { name: "Accounting", college: "Business" },
  { name: "Addiction and Recovery", college: "Human Environmental Sciences" },
  { name: "Advertising", college: "Communication & Information Sciences" },
  { name: "Aerospace Engineering", college: "Engineering" },
  { name: "African American Studies", college: "Arts & Sciences" },
  { name: "American Studies", college: "Arts & Sciences" },
  { name: "Anthropology", college: "Arts & Sciences" },
  { name: "Apparel and Textiles", college: "Human Environmental Sciences" },
  { name: "Applied Liberal Arts and Sciences", college: "Arts & Sciences" },
  { name: "Architectural Engineering", college: "Engineering" },
  { name: "Art History", college: "Arts & Sciences" },
  { name: "Artificial Intelligence", college: "Engineering" },
  { name: "Biology", college: "Arts & Sciences" },
  { name: "Business Cyber Security", college: "Business" },
  { name: "Business Statistics", college: "Business" },
  { name: "Chemical Engineering", college: "Engineering" },
  { name: "Chemistry", college: "Arts & Sciences" },
  { name: "Civil Engineering", college: "Engineering" },
  { name: "Collaborative Education Program", college: "Education" },
  { name: "Communication Studies", college: "Communication & Information Sciences" },
  { name: "Computer Engineering", college: "Engineering" },
  { name: "Computer Science", college: "Engineering" },
  { name: "Construction Engineering", college: "Engineering" },
  { name: "Consumer Sciences", college: "Human Environmental Sciences" },
  { name: "Creative Media", college: "Communication & Information Sciences" },
  { name: "Criminology & Criminal Justice", college: "Arts & Sciences" },
  { name: "Cyber Security", college: "Engineering" },
  { name: "Dance", college: "Arts & Sciences" },
  { name: "Data Science", college: "Arts & Sciences" },
  { name: "Early Childhood Education", college: "Human Environmental Sciences" },
  { name: "Economics", college: "Arts & Sciences" },
  { name: "Educational Neuroscience", college: "Education" },
  { name: "Electrical Engineering", college: "Engineering" },
  { name: "Elementary Education", college: "Education" },
  { name: "English", college: "Arts & Sciences" },
  { name: "Environmental Engineering", college: "Engineering" },
  { name: "Environmental Science", college: "Arts & Sciences" },
  { name: "Finance", college: "Business" },
  { name: "Food and Nutrition", college: "Human Environmental Sciences" },
  { name: "Foreign Languages and Literature", college: "Arts & Sciences" },
  { name: "General Business", college: "Business" },
  { name: "Geography", college: "Arts & Sciences" },
  { name: "Geology", college: "Arts & Sciences" },
  { name: "Graphic Design", college: "Arts & Sciences" },
  { name: "History", college: "Arts & Sciences" },
  { name: "Hospitality Management", college: "Human Environmental Sciences" },
  { name: "Human Development and Family Studies", college: "Human Environmental Sciences" },
  { name: "Human Environmental Sciences", college: "Human Environmental Sciences" },
  { name: "Informatics", college: "Communication & Information Sciences" },
  { name: "Interdisciplinary Studies", college: "Arts & Sciences" },
  { name: "Interior Design", college: "Human Environmental Sciences" },
  { name: "International Studies", college: "Arts & Sciences" },
  { name: "Kinesiology", college: "Education" },
  { name: "Management", college: "Business" },
  { name: "Management Information Systems", college: "Business" },
  { name: "Manufacturing Systems Engineering", college: "Engineering" },
  { name: "Marine Science", college: "Arts & Sciences" },
  { name: "Marketing", college: "Business" },
  { name: "Mathematics", college: "Arts & Sciences" },
  { name: "Mechanical Engineering", college: "Engineering" },
  { name: "Metallurgical Engineering", college: "Engineering" },
  { name: "Microbiology", college: "Arts & Sciences" },
  { name: "Multiple Abilities Program", college: "Education" },
  { name: "Music", college: "Arts & Sciences" },
  { name: "Music Composition", college: "Arts & Sciences" },
  { name: "Music Education", college: "Education" },
  { name: "Music Performance", college: "Arts & Sciences" },
  { name: "Music Theory", college: "Arts & Sciences" },
  { name: "Music Therapy", college: "Arts & Sciences" },
  { name: "Music with a concentration in Arts Administration", college: "Arts & Sciences" },
  { name: "Musical Audio Technology", college: "Arts & Sciences" },
  { name: "Neuroscience", college: "Arts & Sciences" },
  { name: "News Media", college: "Communication & Information Sciences" },
  { name: "Nursing", college: "Nursing" },
  { name: "Nursing (RN to BSN)", college: "Nursing" },
  { name: "Operations Management", college: "Business" },
  { name: "Philosophy", college: "Arts & Sciences" },
  { name: "Physics", college: "Arts & Sciences" },
  { name: "Political Science", college: "Arts & Sciences" },
  { name: "Psychology", college: "Arts & Sciences" },
  { name: "Public Health", college: "Human Environmental Sciences" },
  { name: "Public Relations", college: "Communication & Information Sciences" },
  { name: "Real Estate", college: "Business" },
  { name: "Religious Studies", college: "Arts & Sciences" },
  { name: "Secondary Education", college: "Education" },
  { name: "Social Work", college: "Social Work" },
  { name: "Spanish", college: "Arts & Sciences" },
  { name: "Speech, Language, and Hearing Sciences", college: "Arts & Sciences" },
  { name: "Sport Management", college: "Human Environmental Sciences" },
  { name: "Studio Art", college: "Arts & Sciences" },
  { name: "Theatre", college: "Arts & Sciences" },
];

/**
 * Majors matching `query`, best first: names that start with it, then names with a word
 * that starts with it ("eng" → "English", then "Aerospace Engineering"), then any
 * substring match. Case-insensitive; a blank query returns nothing.
 */
export function searchMajors(query: string, limit = 8): Major[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (name: string): number => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.split(/[\s(/-]+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return UA_MAJORS.map((m) => ({ m, r: rank(m.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map((x) => x.m);
}
