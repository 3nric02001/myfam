import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { changeEmail, changeName, changePassword } from '$lib/server/account';
import { requireUser } from '$lib/server/guards';
import { field, rawField } from '$lib/server/validation';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
	deleteSubscription,
	listSubscriptions,
	sendToUsers,
	vapidKeys,
	vapidSubject,
	webPushSender
} from '$lib/server/push';
import { parseTheme, themeCookieName } from '$lib/theme';
import { isColor } from '$lib/colors';
import { listMemberColors, setMemberColor } from '$lib/server/families';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const { user } = requireUser(locals);
	const colors = locals.family ? await listMemberColors(db, locals.family.id) : [];
	return {
		myColor: colors.find((m) => m.id === user.id)?.color ?? null,
		theme: parseTheme(cookies.get(themeCookieName)),
		push: {
			publicKey: vapidKeys(db, env).publicKey,
			devices: await listSubscriptions(db, user.id)
		}
	};
};

export const actions: Actions = {
	color: async ({ request, locals }) => {
		const { user } = requireUser(locals);
		const color = field(await request.formData(), 'color');
		if (!locals.family || !isColor(color)) return fail(400, { action: 'color' as const });
		await setMemberColor(db, locals.family.id, user.id, color);
		return { action: 'color' as const };
	},

	// Stored per device in a cookie, so the phone can stay light while the tablet is dark.
	theme: async ({ request, cookies, url }) => {
		const theme = parseTheme(field(await request.formData(), 'theme'));
		cookies.set(themeCookieName, theme, {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			secure: !dev && url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 400
		});
		return { action: 'theme', theme };
	},

	pushTest: async ({ locals }) => {
		const { user } = requireUser(locals);
		const send = webPushSender(vapidKeys(db, env), vapidSubject(env));
		const count = await sendToUsers(
			db,
			[user.id],
			{ title: 'MyFam', body: 'So sehen Erinnerungen aus.', url: '/einstellungen', tag: 'test' },
			send
		);
		if (count === 0) {
			return fail(400, {
				action: 'push',
				message: 'Die Testnachricht ist bei keinem Gerät angekommen.'
			});
		}
		return {
			action: 'push',
			success:
				count === 1 ? 'Testnachricht verschickt.' : `Testnachricht an ${count} Geräte verschickt.`
		};
	},

	pushRemove: async ({ request, locals }) => {
		const { user } = requireUser(locals);
		await deleteSubscription(db, user.id, { id: field(await request.formData(), 'id') });
		return { action: 'push', success: 'Das Gerät bekommt keine Benachrichtigungen mehr.' };
	},

	name: async ({ request, locals }) => {
		const { user } = requireUser(locals);
		const name = field(await request.formData(), 'name');
		const result = await changeName(db, user.id, name);
		if (!result.ok) return fail(400, { action: 'name', name, message: result.reason });
		return { action: 'name', success: 'Dein Name wurde geändert.' };
	},

	email: async ({ request, locals }) => {
		const { user } = requireUser(locals);
		const form = await request.formData();
		const email = field(form, 'email');
		const result = await changeEmail(db, user.id, {
			email,
			currentPassword: rawField(form, 'currentPassword')
		});
		if (!result.ok) return fail(400, { action: 'email', email, message: result.reason });
		return { action: 'email', success: 'Deine E-Mail-Adresse wurde geändert.' };
	},

	password: async ({ request, locals }) => {
		const { user, sessionId } = requireUser(locals);
		const form = await request.formData();
		const newPassword = rawField(form, 'newPassword');
		if (newPassword !== rawField(form, 'confirmPassword')) {
			return fail(400, {
				action: 'password',
				message: 'Die neuen Passwörter stimmen nicht überein.'
			});
		}
		const result = await changePassword(db, user.id, sessionId, {
			currentPassword: rawField(form, 'currentPassword'),
			newPassword
		});
		if (!result.ok) return fail(400, { action: 'password', message: result.reason });
		return {
			action: 'password',
			success: 'Dein Passwort wurde geändert. Auf anderen Geräten musst du dich neu anmelden.'
		};
	}
};
