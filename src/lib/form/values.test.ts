import type { RecordModel } from 'pocketbase'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SchemaCollection } from '#lib/config/index.js'

import { buildFormModel } from './model'
import { initialValues, recordPayload, slugify, snapshotValues } from './values'

const stores: SchemaCollection = {
	fields: [
		{ name: 'name', type: 'text' },
		{ name: 'seats', type: 'number' },
		{ name: 'open', type: 'bool' },
		{ maxSelect: 1, name: 'region', type: 'select', values: ['north', 'south'] },
		{ maxSelect: 2, name: 'tags', type: 'select', values: ['a', 'b'] },
		{ name: 'opened_on', type: 'date' },
		{ name: 'reviewed_at', type: 'date' },
		{ name: 'added_by', type: 'relation' },
		{ name: 'added_at', type: 'date' },
		{ name: 'updated', type: 'autodate' },
	],
	name: 'stores',
}
const model = buildFormModel(
	{
		collections: {
			stores: {
				fields: { added_at: { autofill: 'now' }, added_by: { autofill: 'currentUser' }, opened_on: { widget: 'date' } },
			},
		},
		version: 1,
	},
	stores,
	'en',
)
const record = {
	added_at: '2020-01-01 00:00:00.000Z',
	added_by: 'u1',
	id: 's1',
	name: 'Lighthouse',
	open: true,
	opened_on: '2024-03-05 00:00:00.000Z',
	region: 'north',
	reviewed_at: '2024-03-05 09:30:15.000Z',
	seats: 12,
	tags: ['a'],
	updated: '2024-03-06 10:00:00.000Z',
} as unknown as RecordModel
const now = new Date('2026-11-27T01:02:03.000Z')

// The browser's time zone decides what a datetime-local input shows.
beforeEach(() => vi.stubEnv('TZ', 'Asia/Tokyo'))
afterEach(() => vi.unstubAllEnvs())

describe('initialValues', () => {
	it('turns a record into input values', () => {
		expect(initialValues(model, record)).toEqual({
			name: 'Lighthouse',
			open: true,
			opened_on: '2024-03-05',
			region: 'north',
			reviewed_at: '2024-03-05T18:30',
			seats: 12,
			tags: ['a'],
			updated: '2024-03-06 10:00:00.000Z',
		})
	})

	it('starts a new record blank', () => {
		expect(initialValues(model, undefined)).toEqual({
			name: '',
			open: false,
			opened_on: '',
			region: '',
			reviewed_at: '',
			seats: undefined,
			tags: [],
			updated: '',
		})
	})
})

describe('recordPayload', () => {
	it('sends every editable field and fills the autofill fields on create', () => {
		const values = {
			...initialValues(model, undefined),
			name: 'Pier',
			opened_on: '2024-04-01',
			reviewed_at: '2024-04-01T09:00',
		}

		expect(recordPayload(model, values, { now, userId: 'u9' })).toEqual({
			added_at: '2026-11-27 01:02:03.000Z',
			added_by: 'u9',
			name: 'Pier',
			open: false,
			opened_on: '2024-04-01 00:00:00.000Z',
			region: '',
			reviewed_at: '2024-04-01 00:00:00.000Z',
			seats: 0,
			tags: [],
		})
	})

	it('sends only what changed on update, and never the autofill fields', () => {
		const initial = initialValues(model, record)
		const values = { ...initial, seats: undefined, tags: ['a', 'b'] }

		// The seconds of reviewed_at are not lost, because it is not sent.
		expect(recordPayload(model, values, { initial, now, userId: 'u9' })).toEqual({ seats: 0, tags: ['a', 'b'] })
		expect(recordPayload(model, initial, { initial, now })).toEqual({})
	})
})

describe('recordPayload with files', () => {
	const schema: SchemaCollection = {
		fields: [
			{ name: 'cover', type: 'file' },
			{ maxSelect: 5, name: 'gallery', type: 'file' },
		],
		name: 'pages',
	}
	const pages = buildFormModel({ collections: { pages: {} }, version: 1 }, schema, 'en')
	const saved = { cover: 'old.webp', gallery: ['a.webp', 'b.webp'], id: 'p1' } as unknown as RecordModel
	const photo = new File(['x'], 'new.webp', { type: 'image/webp' })

	it('reads stored names as lists', () => {
		expect(initialValues(pages, saved)).toEqual({ cover: ['old.webp'], gallery: ['a.webp', 'b.webp'] })
		expect(initialValues(pages, undefined)).toEqual({ cover: [], gallery: [] })
	})

	it('sends new files on create', () => {
		expect(recordPayload(pages, { cover: [photo], gallery: [photo] }, { now })).toEqual({
			cover: photo,
			gallery: [photo],
		})
		expect(recordPayload(pages, { cover: [], gallery: [] }, { now })).toEqual({ cover: '', gallery: [] })
	})

	it('replaces or removes a single file', () => {
		const initial = initialValues(pages, saved)
		expect(recordPayload(pages, { ...initial, cover: [photo] }, { initial, now })).toEqual({ cover: photo })
		expect(recordPayload(pages, { ...initial, cover: [] }, { initial, now })).toEqual({ cover: '' })
	})

	it('changes several files with the remove and append modifiers', () => {
		const initial = initialValues(pages, saved)
		expect(recordPayload(pages, { ...initial, gallery: ['b.webp', photo] }, { initial, now })).toEqual({
			'gallery+': [photo],
			'gallery-': ['a.webp'],
		})
		expect(recordPayload(pages, { ...initial, gallery: [] }, { initial, now })).toEqual({
			'gallery-': ['a.webp', 'b.webp'],
		})
	})

	it('saves the size and type of an image uploaded to the media library', async () => {
		const { prepareFile } = await import('#lib/media/compress.js')
		const media = buildFormModel(
			{
				collections: { media: { fields: { width: { readonly: true } } } },
				media: {
					collection: 'media',
					fileField: 'file',
					heightField: 'height',
					mimeField: 'mime',
					widthField: 'width',
				},
				version: 1,
			},
			{
				fields: [
					{ name: 'file', type: 'file' },
					{ name: 'width', type: 'number' },
					{ name: 'height', type: 'number' },
					{ name: 'mime', type: 'text' },
				],
				name: 'media',
			},
			'en',
		)
		const codec = { decode: async () => ({ height: 30, width: 40 }), encode: async () => new Blob() }
		const { file } = await prepareFile(new File(['x'], 'a.gif', { type: 'image/gif' }), media.main[0]!.compress!, {
			codec,
		})
		const initial = initialValues(media, { file: 'old.gif', height: 1, id: 'm1', mime: 'image/gif', width: 1 } as never)

		// The width is read-only on the form, yet filled from the image.
		expect(recordPayload(media, { ...initial, file: [file] }, { initial, now })).toEqual({
			file,
			height: 30,
			mime: 'image/gif',
			width: 40,
		})
	})
})

describe('snapshotValues', () => {
	it('copies the lists and keeps the chosen files themselves', () => {
		const photo = new File(['x'], 'a.png', { type: 'image/png' })
		const values = { files: ['old.png', photo], title: 'Pier' }
		const copy = snapshotValues(values)

		expect(copy).toEqual(values)
		expect(copy.files).not.toBe(values.files)
		expect((copy.files as unknown[])[1]).toBe(photo)
	})
})

describe('slugify', () => {
	it('keeps lowercase letters and digits joined by hyphens', () => {
		expect(slugify('  Café & Bar: Opening 2026! ')).toBe('cafe-bar-opening-2026')
		expect(slugify('ＡＢＣ\u{3000}１２３')).toBe('abc-123')
		expect(slugify('秋のブレンド')).toBe('')
	})
})
