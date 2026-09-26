import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { setSessionFamily } from '$lib/server/auth';
import {
	createInvite,
	deleteFamily,
	getFamilyState,
	getMembership,
	listMembers,
	removeMember,
	setFamilyState,
	setRole
} from '$lib/server/families';
import { isState } from '$lib/holidays';
import { canResetPassword, createPasswordReset } from '$lib/server/password-reset';
import { uploads } from '$lib/server/upload-dir';
import { deleteImageFiles } from '$lib/server/uploads';
import { requireAdmin, requireFamily, requireUser } from '$lib/server/guards';
import { field } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, family } = requireFamily(locals);
	const members = await listMembers(db, family.id);
	// Members whose password this admin may reset (not someone who is also in another family).
	const resettable: string[] = [];
	if (family.role === 'admin') {
		for (const m of members) if (await canResetPassword(db, user.id, m.id)) resettable.push(m.id);
	}
	return {
		members,
		resettable,
		state: await getFamilyState(db, family.id)
	};
};

export const actions: Actions = {
	invite: async ({ locals, url }) => {
		const { user, family } = requireAdmin(locals);
		const { token, expiresAt } = await createInvite(db, family.id, user.id);
		return { inviteUrl: `${url.origin}/einladung/${token}`, inviteExpiresAt: expiresAt };
	},

	resetLink: async ({ request, locals, url }) => {
		const { user, family } = requireAdmin(locals);
		const userId = field(await request.formData(), 'userId');
		const member = (await listMembers(db, family.id)).find((m) => m.id === userId);
		if (!member || !(await canResetPassword(db, user.id, userId))) {
			return fail(403, { message: 'Für diese Person kannst du keinen Link erstellen.' });
		}
		const { token } = await createPasswordReset(db, userId, user.id);
		return { resetFor: member.id, resetUrl: `${url.origin}/passwort/${token}` };
	},

	deleteFamily: async ({ request, locals }) => {
		const { family, sessionId } = requireAdmin(locals);
		const confirmName = field(await request.formData(), 'confirmName');
		if (confirmName !== family.name) {
			return fail(400, {
				deleteError: `Bitte gib zur Bestätigung „${family.name}“ genau so ein.`
			});
		}
		const images = await deleteFamily(db, family.id);
		await deleteImageFiles(uploads(), images);
		await setSessionFamily(db, sessionId, null);
		redirect(303, '/');
	},

	remove: async ({ request, locals }) => {
		const { user, family, sessionId } = requireFamily(locals);
		const userId = field(await request.formData(), 'userId');
		// Admins may remove anyone; everyone may leave the family themselves.
		if (userId !== user.id && family.role !== 'admin') return fail(403);
		const result = await removeMember(db, family.id, userId);
		if (!result.ok) return fail(400, { message: result.reason });
		if (userId === user.id) {
			await setSessionFamily(db, sessionId, null);
			redirect(303, '/');
		}
	},

	role: async ({ request, locals }) => {
		const { family } = requireAdmin(locals);
		const form = await request.formData();
		const role = field(form, 'role') === 'admin' ? 'admin' : 'member';
		const result = await setRole(db, family.id, field(form, 'userId'), role);
		if (!result.ok) return fail(400, { message: result.reason });
	},

	state: async ({ request, locals }) => {
		const { family } = requireAdmin(locals);
		const state = field(await request.formData(), 'state');
		await setFamilyState(db, family.id, isState(state) ? state : null);
		return { stateSaved: true };
	},

	switch: async ({ request, locals }) => {
		const { user, sessionId } = requireUser(locals);
		const familyId = field(await request.formData(), 'familyId');
		if (!(await getMembership(db, user.id, familyId))) return fail(403);
		await setSessionFamily(db, sessionId, familyId);
		redirect(303, '/dashboard');
	}
};
