export const MIN_PASSWORD_LENGTH = 10;

export function field(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

export function isEmail(value: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/** Checks the fields of a new account. Returns an error message or null. */
export function checkAccount(input: { name: string; email: string; password: string }) {
	if (!input.name || input.name.length > 60) return 'Bitte gib einen Namen an (max. 60 Zeichen).';
	if (!isEmail(input.email)) return 'Bitte gib eine gültige E-Mail-Adresse an.';
	if (input.password.length < MIN_PASSWORD_LENGTH)
		return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`;
	if (input.password.length > 200) return 'Das Passwort ist zu lang.';
	return null;
}

/** Like field(), but keeps surrounding whitespace (for passwords). */
export function rawField(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}
