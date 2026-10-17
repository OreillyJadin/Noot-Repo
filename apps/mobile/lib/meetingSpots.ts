import type { TutoringLocation } from '@noot/core';

export const OTHER_SPOT = "Other — I'll suggest";

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export function meetingSpotSections(
  list: TutoringLocation[],
  query: string,
): { title: string; items: string[] }[] {
  const normalizedQuery = normalize(query.trim());
  const compactQuery = normalizedQuery.replace(/ /g, '');
  const sections = [
    { category: 'library', title: 'Libraries' },
    { category: 'building', title: 'Campus buildings' },
  ] as const;

  return sections
    .map(({ category, title }) => {
      const items = list
        .filter((location) => {
          if (location.category !== category) return false;
          if (!normalizedQuery) return true;
          const name = normalize(location.name);
          return name.includes(normalizedQuery) || name.replace(/ /g, '').includes(compactQuery);
        })
        .map((location) => location.name)
        .sort((a, b) => a.localeCompare(b));
      return { title, items };
    })
    .filter((section) => section.items.length > 0);
}

export function defaultMeetingSpot(
  list: TutoringLocation[],
  current?: string | null,
): string {
  if (current?.trim() && !current.trim().startsWith('Online')) return current;
  return list.find((location) => location.name === 'Gorgas Library')?.name
    ?? list.find((location) => location.category === 'library')?.name
    ?? list[0]?.name
    ?? OTHER_SPOT;
}
