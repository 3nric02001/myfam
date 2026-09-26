import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { sessionCookieName, setSessionFamily, validateSession } from '$lib/server/auth';
import { getMembership, listFamiliesOfUser } from '$lib/server/families';
import { setSessionCookie } from '$lib/server/cookies';
import { startCalendarSync } from '$lib/server/calendar-sync';
import { parseTheme, themeColor, themeCookieName } from '$lib/theme';
import { vapidKeys, vapidSubject, webPushSender } from '$lib/server/push';
import { startReminderScheduler } from '$lib/server/reminders';

export const init: ServerInit = () => {
	if (env.ORIGIN) console.log(`MyFam erwartet Aufrufe über ${env.ORIGIN}`);
	startReminderScheduler(db, webPushSender(vapidKeys(db, env), vapidSubject(env)));
	startCalendarSync();
};

// Sent with every response, in addition to the content security policy in vite.config.ts.
const SECURITY_HEADERS: Record<string, string> = {
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'geolocation=(), microphone=(), payment=(), usb=()'
};

export const handle: Handle = async (input) => {
	const response = await handleRequest(input);
	try {
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			if (!response.headers.has(name)) response.headers.set(name, value);
		}
	} catch {
		// Some responses (e.g. passed through from fetch) can't be changed.
	}
	return response;
};

const handleRequest: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionId = null;
	event.locals.family = null;

	// Render the chosen appearance right away, so a forced theme never flashes the other one.
	const theme = parseTheme(event.cookies.get(themeCookieName));
	const render = () =>
		resolve(event, {
			transformPageChunk: ({ html }) => {
				if (theme === 'system') return html;
				return html
					.replace('<html lang="de">', `<html lang="de" data-theme="${theme}">`)
					.replace(
						/<meta name="theme-color"[^>]*>\s*<meta name="theme-color"[^>]*>/,
						`<meta name="theme-color" content="${themeColor[theme]}" />`
					);
			}
		});

	const token = event.cookies.get(sessionCookieName);
	if (!token) return render();

	const result = await validateSession(db, token);
	if (!result) {
		event.cookies.delete(sessionCookieName, { path: '/' });
		return render();
	}

	setSessionCookie(event, token, result.session.expiresAt);
	event.locals.user = result.user;
	event.locals.sessionId = result.session.id;

	// Fall back to the user's first family if the chosen one is gone.
	let family = result.session.familyId
		? await getMembership(db, result.user.id, result.session.familyId)
		: null;
	if (!family) {
		family = (await listFamiliesOfUser(db, result.user.id))[0] ?? null;
		if (family?.id !== result.session.familyId) {
			await setSessionFamily(db, result.session.id, family?.id ?? null);
		}
	}
	event.locals.family = family;

	return render();
};
