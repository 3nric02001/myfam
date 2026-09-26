import { describe, expect, it } from 'vitest';
import { safeNext } from './redirects';

const origin = 'https://myfam.example.de';

describe('safeNext', () => {
	it('keeps paths on this site', () => {
		expect(safeNext('/einladung/abc?x=1', origin)).toBe('/einladung/abc?x=1');
		expect(safeNext('/kalender#heute', origin)).toBe('/kalender#heute');
	});

	it('never leads to another site', () => {
		for (const next of [
			'//evil.com',
			'/\\evil.com',
			'/\t/evil.com',
			'/\n/evil.com',
			'https://evil.com',
			'javascript:alert(1)',
			''
		]) {
			expect(safeNext(next, origin)).toBe('/');
		}
		expect(safeNext(null, origin)).toBe('/');
	});
});
