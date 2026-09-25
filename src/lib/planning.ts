// Types shared by the planning pages and the server.

export type TextData = { text: string };
export type TableData = { rows: string[][] };
export type LinkData = { url: string; title: string };
export type ImageData = { imageId: string; caption: string };

export type Block =
	| { id: string; type: 'text'; data: TextData }
	| { id: string; type: 'table'; data: TableData }
	| { id: string; type: 'link'; data: LinkData }
	| { id: string; type: 'image'; data: ImageData };

export const LIMITS = {
	title: 100,
	text: 20_000,
	tableRows: 100,
	tableCols: 12,
	cell: 500,
	url: 2000,
	caption: 200
};
