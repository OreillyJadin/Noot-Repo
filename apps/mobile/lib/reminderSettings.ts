export type ReminderSettings = { minutesBefore: number[]; morningOf: boolean; dayOfTime: string };

export const DAY_OF_TIMES = Array.from({ length: 13 }, (_, index) => {
  const hour = 6 + Math.floor(index / 2);
  const minute = index % 2 ? '30' : '00';
  return { value: `${String(hour).padStart(2, '0')}:${minute}`, label: `${hour}:${minute} ${hour === 12 ? 'PM' : 'AM'}` };
});

export function masterReminderSettings(current: ReminderSettings, enabled: boolean, remembered: ReminderSettings | null): ReminderSettings {
  if (!enabled) return { ...current, minutesBefore: [], morningOf: false };
  return remembered ?? { minutesBefore: [60], morningOf: true, dayOfTime: current.dayOfTime };
}
