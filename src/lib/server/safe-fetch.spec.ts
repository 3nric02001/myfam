import { describe, expect, it } from 'vitest';
import { BlockedAddressError, isPrivateAddress, parseHostList, publicFetch } from './safe-fetch';

describe('isPrivateAddress', () => {
	it('recognises internal addresses', () => {
		for (const ip of [
			'127.0.0.1',
			'10.1.2.3',
			'172.17.0.1',
			'192.168.178.1',
			'169.254.169.254',
			'100.64.0.1',
			'0.0.0.0',
			'::1',
			'fd00::1',
			'fe80::1',
			'::ffff:192.168.0.1'
		]) {
			expect(isPrivateAddress(ip), ip).toBe(true);
		}
	});

	it('lets public addresses through', () => {
		for (const ip of ['1.1.1.1', '93.184.216.34', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8']) {
			expect(isPrivateAddress(ip), ip).toBe(false);
		}
	});
});

type Call = { url: string; method: string; auth: string | null };

function fake(answers: Record<string, () => Response>) {
	const calls: Call[] = [];
	const fetchFn = (async (url: URL, init: RequestInit) => {
		const headers = new Headers(init.headers);
		calls.push({ url: url.href, method: init.method ?? 'GET', auth: headers.get('authorization') });
		return answers[url.href]?.() ?? new Response('nicht da', { status: 404 });
	}) as typeof fetch;
	return { calls, fetchFn };
}

const dns: Record<string, string[]> = {
	'cloud.example.de': ['93.184.216.34'],
	'other.example.com': ['1.1.1.1'],
	'intern.example.de': ['192.168.1.5'],
	'nextcloud.lan': ['192.168.1.10']
};
const lookup = async (host: string) => dns[host] ?? [];

describe('publicFetch', () => {
	it('refuses internal addresses, by IP or by name', async () => {
		const { calls, fetchFn } = fake({});
		const get = publicFetch({ lookup, fetchFn });
		await expect(get('http://127.0.0.1:8080/')).rejects.toBeInstanceOf(BlockedAddressError);
		await expect(get('https://intern.example.de/cal')).rejects.toBeInstanceOf(BlockedAddressError);
		await expect(get('http://[::1]/')).rejects.toBeInstanceOf(BlockedAddressError);
		expect(calls).toEqual([]);
	});

	it('allows hosts the operator lists', async () => {
		const { fetchFn } = fake({ 'https://nextcloud.lan/cal': () => new Response('ok') });
		const get = publicFetch({ lookup, fetchFn, allowHosts: () => ['nextcloud.lan'] });
		expect(await (await get('https://nextcloud.lan/cal')).text()).toBe('ok');
	});

	it('checks every redirect and keeps credentials on their origin', async () => {
		const { calls, fetchFn } = fake({
			'https://cloud.example.de/a': () =>
				new Response(null, { status: 301, headers: { location: '/b' } }),
			'https://cloud.example.de/b': () =>
				new Response(null, { status: 302, headers: { location: 'https://other.example.com/c' } }),
			'https://other.example.com/c': () => new Response('kalender')
		});
		const get = publicFetch({ lookup, fetchFn });
		const res = await get('https://cloud.example.de/a', {
			method: 'REPORT',
			headers: { Authorization: 'Basic geheim' }
		});
		expect(await res.text()).toBe('kalender');
		expect(calls).toEqual([
			{ url: 'https://cloud.example.de/a', method: 'REPORT', auth: 'Basic geheim' },
			{ url: 'https://cloud.example.de/b', method: 'REPORT', auth: 'Basic geheim' },
			{ url: 'https://other.example.com/c', method: 'REPORT', auth: null }
		]);
	});

	it('does not follow a redirect into the internal network', async () => {
		const { fetchFn } = fake({
			'https://cloud.example.de/a': () =>
				new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/admin' } })
		});
		await expect(publicFetch({ lookup, fetchFn })('https://cloud.example.de/a')).rejects.toThrow(
			BlockedAddressError
		);
	});

	it('reads the operator list', () => {
		expect(parseHostList(' Nextcloud.LAN, 192.168.1.10 ,,')).toEqual([
			'nextcloud.lan',
			'192.168.1.10'
		]);
		expect(parseHostList(undefined)).toEqual([]);
	});
});
