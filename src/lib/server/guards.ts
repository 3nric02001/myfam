import { redirect } from '@sveltejs/kit';

export function requireUser(locals: App.Locals) {
	if (!locals.user || !locals.sessionId) redirect(303, '/login');
	return { user: locals.user, sessionId: locals.sessionId };
}

export function requireFamily(locals: App.Locals) {
	const { user, sessionId } = requireUser(locals);
	if (!locals.family) redirect(303, '/familie/neu');
	return { user, sessionId, family: locals.family };
}

export function requireAdmin(locals: App.Locals) {
	const ctx = requireFamily(locals);
	if (ctx.family.role !== 'admin') redirect(303, '/familie');
	return ctx;
}
