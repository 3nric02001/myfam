import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { changeEmail, changeName, changePassword } from '$lib/server/account';
import { requireUser } from '$lib/server/guards';
import { field, rawField } from '$lib/server/validation';
import type { Actions } from './$types';

export const actions: Actions = {
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
