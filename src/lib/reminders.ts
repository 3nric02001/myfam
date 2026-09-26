// Reminder choices for calendar events, in minutes before the start. All-day events start at
// 00:00, so their choices point at a fixed time of day instead (negative = after midnight).

export type ReminderOption = { value: number; label: string };

export const TIMED_REMINDERS: ReminderOption[] = [
	{ value: 0, label: 'Zum Beginn' },
	{ value: 10, label: '10 Minuten vorher' },
	{ value: 30, label: '30 Minuten vorher' },
	{ value: 60, label: '1 Stunde vorher' },
	{ value: 120, label: '2 Stunden vorher' },
	{ value: 1440, label: '1 Tag vorher' }
];

export const ALL_DAY_REMINDERS: ReminderOption[] = [
	{ value: -480, label: 'Am selben Tag um 8 Uhr' },
	{ value: 360, label: 'Am Vortag um 18 Uhr' },
	{ value: 1800, label: '2 Tage vorher um 18 Uhr' }
];

export const DEFAULT_TIMED_REMINDER = 30;
export const DEFAULT_ALL_DAY_REMINDER = 360;

export function reminderOptions(allDay: boolean) {
	return allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS;
}

export function isReminder(value: number, allDay: boolean) {
	return reminderOptions(allDay).some((o) => o.value === value);
}

export function reminderLabel(value: number | null, allDay: boolean) {
	if (value === null) return 'Keine Erinnerung';
	return reminderOptions(allDay).find((o) => o.value === value)?.label ?? `${value} Minuten vorher`;
}
