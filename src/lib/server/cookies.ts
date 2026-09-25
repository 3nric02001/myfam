import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { sessionCookieName } from './auth';

export function setSessionCookie(event: RequestEvent, token: string, expiresAt: Date) {
	event.cookies.set(sessionCookieName, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev && event.url.protocol === 'https:',
		expires: expiresAt
	});
}

export function deleteSessionCookie(event: RequestEvent) {
	event.cookies.delete(sessionCookieName, { path: '/' });
}
