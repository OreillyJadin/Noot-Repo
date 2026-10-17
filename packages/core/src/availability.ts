export interface AvailabilityWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function timeOfDay(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function mergeAvailabilityWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const sorted = windows
    .map((window) => ({
      dayOfWeek: window.dayOfWeek,
      start: minutesOfDay(window.startTime),
      end: minutesOfDay(window.endTime),
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.start - b.start || a.end - b.end);
  const merged: { dayOfWeek: number; start: number; end: number }[] = [];

  for (const window of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && previous.dayOfWeek === window.dayOfWeek && window.start <= previous.end) {
      previous.end = Math.max(previous.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }

  return merged.map(({ dayOfWeek, start, end }) => ({
    dayOfWeek,
    startTime: timeOfDay(start),
    endTime: timeOfDay(end),
  }));
}
