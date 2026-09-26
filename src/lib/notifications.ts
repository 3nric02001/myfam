import type { NotificationKind } from '$lib/server/db/schema';

/** The kinds of push notifications, as listed in the settings. */
export const notificationKinds: { kind: NotificationKind; label: string; hint: string }[] = [
	{
		kind: 'morning',
		label: 'Tagesübersicht',
		hint: 'Morgens um 7 Uhr: Termine, deine Aufgaben und das Essen von heute.'
	},
	{ kind: 'event', label: 'Termine', hint: 'Zu der Zeit, die beim Termin eingestellt ist.' },
	{
		kind: 'task',
		label: 'Aufgaben',
		hint: 'Morgens am Fälligkeitstag und wenn dir jemand eine Aufgabe gibt.'
	},
	{
		kind: 'evening',
		label: 'Offene Aufgaben am Abend',
		hint: 'Um 20 Uhr, wenn von deinen Aufgaben für heute noch etwas offen ist.'
	},
	{ kind: 'comment', label: 'Kommentare', hint: 'Neue Kommentare unter Planungs-Karten.' },
	{
		kind: 'week',
		label: 'Wochenplanung',
		hint: 'Sonntags um 15 Uhr: Termine, Aufgaben und Essen für die nächste Woche planen.'
	},
	{
		kind: 'meals',
		label: 'Essensplan',
		hint: 'Sonntags um 18 Uhr, wenn für die nächste Woche noch Mahlzeiten offen sind und die Wochenplanung nicht abgeschlossen ist.'
	},
	{
		kind: 'receipt',
		label: 'Kassenzettel',
		hint: '5 Minuten nachdem du beim Einkauf abgehakt hast, falls noch kein Bon fotografiert ist.'
	}
];
