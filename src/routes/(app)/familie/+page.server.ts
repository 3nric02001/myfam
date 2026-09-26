import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { setSessionFamily } from '$lib/server/auth';
import {
	createInvite,
	getFamilyState,
	getMembership,
	listMembers,
	removeMember,
	setFamilyState,
	setRole
} from '$lib/server/families';
import { isState } from '$lib/holidays';
import { requireAdmin, requireFamily, requireUser } from '$lib/server/guards';
import { field } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	return {
		members: await listMembers(db, family.id),
		state: await getFamilyState(db, family.id)
	};
};

export const actions: Actions = {
	invite: async ({ locals, url }) => {
		const { user, family } = requireAdmin(locals);
		const { token, expiresAt } = await createInvite(db, family.id, user.id);
		return { inviteUrl: `${url.origin}/einladung/${token}`, inviteExpiresAt: expiresAt };
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
