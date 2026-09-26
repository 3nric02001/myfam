/**
 * A path on this site to continue to after logging in, or '/'. Browsers drop tabs and line
 * breaks in URLs, so the path is resolved like a browser would before checking where it leads.
 */
export function safeNext(next: string | null, origin: string) {
	if (!next || !next.startsWith('/')) return '/';
	let url: URL;
	try {
		url = new URL(next, origin);
	} catch {
		return '/';
	}
	if (url.origin !== origin) return '/';
	return url.pathname + url.search + url.hash;
}
