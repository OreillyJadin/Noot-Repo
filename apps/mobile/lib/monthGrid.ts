export function monthMatrix(year: number, month0: number): Date[][] {
  const first = new Date(year, month0, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const weekCount = Math.max(4, Math.ceil((firstWeekday + daysInMonth) / 7));
  const start = new Date(year, month0, 1 - firstWeekday);

  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const offset = week * 7 + day;
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    }),
  );
}

export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function groupByDay<T extends { startsAt: string }>(items: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = dayKey(new Date(item.startsAt));
    (groups[key] ??= []).push(item);
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }
  return groups;
}

export function monthRange(year: number, month0: number): { fromIso: string; toIso: string } {
  const matrix = monthMatrix(year, month0);
  const first = matrix[0]![0]!;
  const last = matrix[matrix.length - 1]![6]!;
  return {
    fromIso: first.toISOString(),
    toIso: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString(),
  };
}

export function splitClock(label: string): { clock: string; meridiem: string | null } {
  const trimmed = label.trim();
  const match = trimmed.match(/^(.*?)\s*([ap])\.?\s*m\.?$/i);
  if (!match) return { clock: trimmed, meridiem: null };
  return {
    clock: match[1]!.trim(),
    meridiem: match[2]!.toUpperCase() === 'A' ? 'AM' : 'PM',
  };
}
