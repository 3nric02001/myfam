// A small, safe subset of Markdown for text blocks on planning cards.
// All HTML is escaped first, so user text can never inject markup.
//
//   # Überschrift / ## Kleinere Überschrift
//   **fett**, *kursiv*, ~~durchgestrichen~~
//   - Aufzählung, 1. Nummeriert, - [ ] offen / - [x] erledigt
//   Links wie https://example.de werden anklickbar.

const escape = (s: string) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

function inline(text: string) {
	return escape(text)
		.replace(
			/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)'"&]/g,
			(url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
		)
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
		.replace(/~~(.+?)~~/g, '<del>$1</del>');
}

type List = { tag: 'ul' | 'ol'; items: string[] };

/** Renders the text as HTML. Safe to use with {@html}. */
export function renderText(text: string): string {
	const out: string[] = [];
	let list: List | null = null;
	let paragraph: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
		paragraph = [];
	};
	const flushList = () => {
		if (list) out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);
		list = null;
	};
	const addItem = (tag: List['tag'], html: string) => {
		flushParagraph();
		if (list?.tag !== tag) {
			flushList();
			list = { tag, items: [] };
		}
		list!.items.push(html);
	};

	for (const line of text.split('\n')) {
		let m: RegExpMatchArray | null;
		if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
			flushParagraph();
			flushList();
			const level = m[1].length + 2; // # -> h3, ## -> h4, ### -> h5
			out.push(`<h${level}>${inline(m[2])}</h${level}>`);
		} else if ((m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))) {
			const done = m[1] !== ' ';
			addItem(
				'ul',
				`<li class="task${done ? ' done' : ''}"><span aria-hidden="true">${done ? '☑' : '☐'}</span> ${inline(m[2])}</li>`
			);
		} else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
			addItem('ul', `<li>${inline(m[1])}</li>`);
		} else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
			addItem('ol', `<li>${inline(m[1])}</li>`);
		} else if (!line.trim()) {
			flushParagraph();
			flushList();
		} else {
			flushList();
			paragraph.push(line);
		}
	}
	flushParagraph();
	flushList();
	return out.join('');
}
