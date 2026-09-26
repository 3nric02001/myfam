// Light or dark appearance, chosen per device under Einstellungen. 'system' follows the device.
export type Theme = 'system' | 'light' | 'dark';

export const themeCookieName = 'theme';

export function parseTheme(value: string | null | undefined): Theme {
	return value === 'light' || value === 'dark' ? value : 'system';
}

/** Browser bar color, matching the header background in src/routes/layout.css. */
export const themeColor = { light: '#ffffff', dark: '#221f1c' } as const;

// Text size, also per device: 'large' scales the whole app by 12.5% (see src/routes/layout.css).
export type TextSize = 'normal' | 'large';

export const textSizeCookieName = 'textsize';

export function parseTextSize(value: string | null | undefined): TextSize {
	return value === 'large' ? 'large' : 'normal';
}
