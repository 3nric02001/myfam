// Light or dark appearance, chosen per device under Einstellungen. 'system' follows the device.
export type Theme = 'system' | 'light' | 'dark';

export const themeCookieName = 'theme';

export function parseTheme(value: string | null | undefined): Theme {
	return value === 'light' || value === 'dark' ? value : 'system';
}

/** Browser bar color, matching the header background in src/routes/layout.css. */
export const themeColor = { light: '#ffffff', dark: '#1d1a18' } as const;
