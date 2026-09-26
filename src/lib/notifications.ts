import type { NotificationKind } from '$lib/server/db/schema';

/** The kinds of push notifications, as listed in the settings. */
export const notificationKinds: { kind: NotificationKind; label: string; hint: string }[] = [
	{ kind: 'event', label: 'Termine', hint: 'Zu der Zeit, die beim Termin eingestellt ist.' },
	{
		kind: 'task',
		label: 'Aufgaben',
		hint: 'Morgens am Fälligkeitstag und wenn dir jemand eine Aufgabe gibt.'
	},
	{ kind: 'comment', label: 'Kommentare', hint: 'Neue Kommentare unter Planungs-Karten.' },
	{
		kind: 'meals',
		label: 'Essensplan',
		hint: 'Sonntags um 18 Uhr, wenn für die nächste Woche noch Mahlzeiten offen sind.'
	},
	{
		kind: 'receipt',
		label: 'Kassenzettel',
		hint: '5 Minuten nachdem du beim Einkauf abgehakt hast, falls noch kein Bon fotografiert ist.'
	}
];
