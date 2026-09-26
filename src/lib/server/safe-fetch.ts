import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Fetch for addresses that family admins type in (calendar subscriptions). The server must not
// become a way into the home network, so only public addresses are allowed, on every redirect
// too. Hosts in the operator's list (CALDAV_ALLOW_HOSTS, e.g. a Nextcloud in the LAN) are fine.

type Fetch = typeof fetch;
type Lookup = (host: string) => Promise<string[]>;

export class BlockedAddressError extends Error {}

const blocked = new BlockList();
for (const [net, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['224.0.0.0', 4],
	['240.0.0.0', 4]
] as const) {
	blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
	['::', 128],
	['::1', 128],
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8],
	['64:ff9b::', 96],
	['2001:db8::', 32]
] as const) {
	blocked.addSubnet(net, prefix, 'ipv6');
}

/** Whether the IP address is loopback, private, link-local or otherwise not on the internet. */
export function isPrivateAddress(ip: string) {
	const family = isIP(ip);
	if (family === 4) return blocked.check(ip, 'ipv4');
	if (family === 6) {
		// IPv4 written as IPv6 (::ffff:10.0.0.1) counts like the IPv4 address.
		const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return blocked.check(mapped[1], 'ipv4');
		return blocked.check(ip, 'ipv6');
	}
	return true;
}

const systemLookup: Lookup = async (host) =>
	(await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Host names (or IPs) from a comma-separated list, lower case. */
export function parseHostList(value: string | undefined) {
	return (value ?? '')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);
}

async function checkHost(url: URL, allowed: string[], lookup: Lookup) {
	const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (allowed.includes(host)) return;
	const addresses = isIP(host) ? [host] : await lookup(host).catch(() => []);
	// No address: let fetch fail with its own "not reachable" error.
	if (addresses.some(isPrivateAddress)) {
		throw new BlockedAddressError(`${host} ist eine interne Adresse`);
	}
}

const MAX_REDIRECTS = 5;

/**
 * A fetch that refuses internal addresses and follows redirects itself, checking each one.
 * Credentials are only sent to the origin they were given for.
 */
export function publicFetch(
	options: { allowHosts?: () => string[]; lookup?: Lookup; fetchFn?: Fetch } = {}
): Fetch {
	const lookup = options.lookup ?? systemLookup;
	const fetchFn = options.fetchFn ?? fetch;
	return (async (input: string | URL | Request, init: RequestInit = {}) => {
		let url = new URL(input instanceof Request ? input.url : input);
		const origin = url.origin;
		let { method = 'GET', body } = init;
		let headers = new Headers(init.headers);
		const allowed = options.allowHosts?.() ?? [];
		for (let hop = 0; ; hop++) {
			await checkHost(url, allowed, lookup);
			const res = await fetchFn(url, { ...init, method, body, headers, redirect: 'manual' });
			const location = res.headers.get('location');
			if (res.status < 300 || res.status >= 400 || !location) return res;
			await res.body?.cancel();
			if (hop >= MAX_REDIRECTS) throw new TypeError('Zu viele Weiterleitungen');
			url = new URL(location, url);
			if (url.protocol !== 'https:' && url.protocol !== 'http:') {
				throw new TypeError('Weiterleitung auf eine ungültige Adresse');
			}
			if (res.status === 303 && method !== 'HEAD') {
				method = 'GET';
				body = undefined;
			}
			if (url.origin !== origin) {
				headers = new Headers(headers);
				headers.delete('authorization');
			}
		}
	}) as Fetch;
}
