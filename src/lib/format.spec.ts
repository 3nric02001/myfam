import { describe, expect, it } from 'vitest';
import { renderText } from './format';

describe('renderText', () => {
	it('escapes HTML', () => {
		expect(renderText('<script>alert(1)</script> & "x"')).toBe(
			'<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>'
		);
		expect(renderText('<img src=x onerror=alert(1)>')).not.toContain('<img');
	});

	it('formats headings, emphasis and lists', () => {
		expect(renderText('# Urlaub\n**Wichtig** und *leise*\nzweite Zeile')).toBe(
			'<h3>Urlaub</h3><p><strong>Wichtig</strong> und <em>leise</em><br>zweite Zeile</p>'
		);
		expect(renderText('- Zelt\n- Schlafsack\n\n1. Packen\n2. Fahren')).toBe(
			'<ul><li>Zelt</li><li>Schlafsack</li></ul><ol><li>Packen</li><li>Fahren</li></ol>'
		);
		expect(renderText('- [x] gebucht\n- [ ] bezahlt')).toContain('class="task done"');
	});

	it('links URLs without breaking out of the attribute', () => {
		expect(renderText('Siehe https://example.de/a?b=1&c=2.')).toBe(
			'<p>Siehe <a href="https://example.de/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">https://example.de/a?b=1&amp;c=2</a>.</p>'
		);
		expect(renderText('https://x.de/"onmouseover="alert(1)')).not.toContain('"onmouseover');
		expect(renderText('javascript:alert(1)')).not.toContain('<a');
	});
});
