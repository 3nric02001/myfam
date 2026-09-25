// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Role } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			user: { id: string; email: string; name: string } | null;
			sessionId: string | null;
			/** The family the user is currently working in. */
			family: { id: string; name: string; role: Role } | null;
		}
	}
}

export {};
