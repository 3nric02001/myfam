import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	// The public address the server expects. Form posts from any other address are rejected.
	return { expectedOrigin: env.ORIGIN ? new URL(env.ORIGIN).origin : null };
};
