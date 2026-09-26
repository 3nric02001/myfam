// Colors a calendar subscription can have. The values live in routes/layout.css (--color-cal-*);
// the full class names are written out here so Tailwind finds them.

export const subscriptionColors = {
	blue: { label: 'Blau', dot: 'bg-cal-blue', text: 'text-cal-blue' },
	plum: { label: 'Pflaume', dot: 'bg-cal-plum', text: 'text-cal-plum' },
	rose: { label: 'Rosé', dot: 'bg-cal-rose', text: 'text-cal-rose' },
	olive: { label: 'Oliv', dot: 'bg-cal-olive', text: 'text-cal-olive' },
	amber: { label: 'Bernstein', dot: 'bg-accent-500', text: 'text-accent-600' },
	slate: { label: 'Grau', dot: 'bg-slate-500', text: 'text-slate-500' }
} as const;

export type SubscriptionColor = keyof typeof subscriptionColors;

export function isSubscriptionColor(value: string): value is SubscriptionColor {
	return Object.hasOwn(subscriptionColors, value);
}

export const colorOf = (value: string) =>
	subscriptionColors[isSubscriptionColor(value) ? value : 'blue'];
