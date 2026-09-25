import { describe, expect, it } from 'vitest';
import { createUser } from './auth';
import { acceptInvite, createInvite } from './families';
import {
	addBlock,
	addImage,
	createCard,
	createFolder,
	deleteBlock,
	deleteFolder,
	getCard,
	getFolder,
	getImage,
	listBlocks,
	listCards,
	listFolders,
	moveBlock,
	parseBlock,
	updateFolder,
	type Viewer
} from './planning';
import { parseVisibility } from './visibility';
import { seedFamily, testDb } from './test/setup';

async function familyOfThree() {
	const db = testDb();
	const { owner, family } = await seedFamily(db, 'anna');
	const join = async (name: string) => {
		const u = await createUser(db, {
			email: `${name}@example.com`,
			name,
			password: 'geheim-passwort'
		});
		const { token } = await createInvite(db, family.id, owner.id);
		await acceptInvite(db, token, u.id);
		return u;
	};
	const bert = await join('bert');
	const cara = await join('cara');
	const as = (id: string, isAdmin = false): Viewer => ({
		familyId: family.id,
		userId: id,
		isAdmin
	});
	return { db, family, anna: as(owner.id, true), bert: as(bert.id), cara: as(cara.id) };
}

const form = (entries: [string, string][]) => {
	const f = new FormData();
	for (const [k, v] of entries) f.append(k, v);
	return f;
};

describe('parseVisibility', () => {
	it('defaults to family and only accepts members', () => {
		expect(parseVisibility(form([]), ['a', 'b'], 'a')).toEqual({
			visibility: 'family',
			shareWith: []
		});
		expect(
			parseVisibility(
				form([
					['visibility', 'shared'],
					['share', 'b'],
					['share', 'a'],
					['share', 'stranger']
				]),
				['a', 'b'],
				'a'
			)
		).toEqual({ visibility: 'shared', shareWith: ['b'] });
		expect(parseVisibility(form([['visibility', 'shared']]), ['a'], 'a')).toHaveProperty('error');
	});
});

describe('planning folders', () => {
	it('applies family, shared and private visibility', async () => {
		const { db, anna, bert, cara } = await familyOfThree();
		await createFolder(db, anna, 'Urlaub', { visibility: 'family', shareWith: [] });
		await createFolder(db, anna, 'Geschenke', { visibility: 'shared', shareWith: [bert.userId] });
		const diary = await createFolder(db, anna, 'Tagebuch', {
			visibility: 'private',
			shareWith: []
		});

		const names = async (v: Viewer) => (await listFolders(db, v)).map((f) => f.name);
		expect(await names(anna)).toEqual(['Geschenke', 'Tagebuch', 'Urlaub']);
		expect(await names(bert)).toEqual(['Geschenke', 'Urlaub']);
		expect(await names(cara)).toEqual(['Urlaub']);

		// Hidden folders cannot be opened or filled by id, not even by an admin.
		const annaOnly = await createFolder(db, bert, 'Bert privat', {
			visibility: 'private',
			shareWith: []
		});
		expect(await getFolder(db, cara, diary.id)).toBeNull();
		expect(await createCard(db, cara, diary.id, 'Hack')).toBeNull();
		expect(await getFolder(db, anna, annaOnly.id)).toBeNull();
		expect(await deleteFolder(db, anna, annaOnly.id)).toBeNull();
	});

	it('lets only the creator or an admin change a folder', async () => {
		const { db, anna, bert, cara } = await familyOfThree();
		const folder = await createFolder(db, bert, 'Garten', { visibility: 'family', shareWith: [] });

		expect(
			await updateFolder(db, cara, folder.id, 'Mein Garten', {
				visibility: 'private',
				shareWith: []
			})
		).toBe(false);
		expect(await deleteFolder(db, cara, folder.id)).toBeNull();

		expect(
			await updateFolder(db, bert, folder.id, 'Garten 2027', {
				visibility: 'shared',
				shareWith: [cara.userId]
			})
		).toBe(true);
		const updated = await getFolder(db, cara, folder.id);
		expect(updated?.name).toBe('Garten 2027');
		expect(updated?.sharedWith.map((s) => s.name)).toEqual(['cara']);
		expect(await getFolder(db, anna, folder.id)).toBeNull();

		await updateFolder(db, bert, folder.id, 'Garten 2027', { visibility: 'family', shareWith: [] });
		expect(await deleteFolder(db, anna, folder.id)).toEqual([]);
		expect(await listFolders(db, bert)).toEqual([]);
	});

	it('keeps families apart', async () => {
		const { db, anna } = await familyOfThree();
		const other = await seedFamily(db, 'dora');
		const dora: Viewer = { familyId: other.family.id, userId: other.owner.id, isAdmin: true };
		const folder = await createFolder(db, anna, 'Urlaub', { visibility: 'family', shareWith: [] });
		const card = await createCard(db, anna, folder.id, 'Packliste');

		expect(await listFolders(db, dora)).toEqual([]);
		expect(await getFolder(db, dora, folder.id)).toBeNull();
		expect(await getCard(db, dora, card!.id)).toBeNull();
	});
});

describe('planning cards and blocks', () => {
	it('stores ordered blocks and inherits folder permissions', async () => {
		const { db, anna, bert, cara } = await familyOfThree();
		const folder = await createFolder(db, anna, 'Urlaub', {
			visibility: 'shared',
			shareWith: [bert.userId]
		});
		const card = (await createCard(db, bert, folder.id, 'Packliste'))!;

		const text = parseBlock('text', form([['text', '# Kleidung\r\n- Jacke\n']]));
		const table = parseBlock('table', form([['rows', JSON.stringify([['Was', 'Wer'], ['Zelt']])]]));
		const link = parseBlock(
			'link',
			form([
				['url', 'campingplatz.de/buchen'],
				['title', 'Platz']
			])
		);
		if ('error' in text || 'error' in table || 'error' in link) throw new Error('invalid');
		expect(table.data).toEqual({
			rows: [
				['Was', 'Wer'],
				['Zelt', '']
			]
		});
		expect(link.data).toEqual({ url: 'https://campingplatz.de/buchen', title: 'Platz' });

		const t = await addBlock(db, bert, card.id, text);
		await addBlock(db, anna, card.id, table);
		const l = await addBlock(db, anna, card.id, link);
		await moveBlock(db, anna, card.id, l!.id, -1);

		expect((await listBlocks(db, bert, card.id)).map((b) => b.type)).toEqual([
			'text',
			'link',
			'table'
		]);
		expect((await listCards(db, anna, folder.id))[0]).toMatchObject({
			title: 'Packliste',
			blocks: 3
		});

		// Cara cannot see, change or delete anything in the folder.
		expect(await listBlocks(db, cara, card.id)).toEqual([]);
		expect(await addBlock(db, cara, card.id, text)).toBeNull();
		expect(await deleteBlock(db, cara, card.id, t!.id)).toBeNull();
		expect(await listCards(db, cara, folder.id)).toEqual([]);
	});

	it('rejects invalid content', () => {
		expect(parseBlock('text', form([['text', '  ']]))).toHaveProperty('error');
		expect(parseBlock('link', form([['url', 'javascript:alert(1)']]))).toHaveProperty('error');
		expect(parseBlock('link', form([['url', 'nur text']]))).toHaveProperty('error');
		expect(parseBlock('table', form([['rows', '{"x":1}']]))).toHaveProperty('error');
		expect(
			parseBlock('table', form([['rows', JSON.stringify([Array(13).fill('')])]]))
		).toHaveProperty('error');
		expect(parseBlock('image', form([]))).toHaveProperty('error');
	});

	it('only serves images to people who can see the card', async () => {
		const { db, anna, bert } = await familyOfThree();
		const folder = await createFolder(db, anna, 'Privat', { visibility: 'private', shareWith: [] });
		const card = (await createCard(db, anna, folder.id, 'Fotos'))!;
		const image = (await addImage(db, anna, card.id, { mimeType: 'image/jpeg', size: 10 }))!;
		const block = await addBlock(db, anna, card.id, {
			type: 'image',
			data: { imageId: image.id, caption: '' }
		});

		expect(await getImage(db, anna, image.id)).toMatchObject({ mimeType: 'image/jpeg' });
		expect(await getImage(db, bert, image.id)).toBeNull();
		expect(await addImage(db, bert, card.id, { mimeType: 'image/jpeg', size: 1 })).toBeNull();

		expect(await deleteBlock(db, anna, card.id, block!.id)).toEqual([image.id]);
		expect(await getImage(db, anna, image.id)).toBeNull();
	});
});
