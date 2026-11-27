import type { RecordModel } from 'pocketbase'

import PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'

import type { CmsConfig, FieldConfig, SchemaCollection } from '#lib/config/index.js'

import { type CellContext, listCell } from './cell'
import { buildListModel } from './model'

const schema: SchemaCollection[] = [
	{ fields: [{ name: 'title', type: 'text' }], name: 'posts' },
	{ fields: [{ name: 'label', type: 'text' }], name: 'categories' },
	{
		fields: [
			{ name: 'file', type: 'file' },
			{ name: 'alt', type: 'text' },
		],
		name: 'media',
	},
]
const config: CmsConfig = {
	collections: { categories: { titleField: 'label' }, media: {}, posts: {} },
	media: { altField: 'alt', collection: 'media', fileField: 'file' },
	version: 1,
}
const context: CellContext = {
	config,
	model: buildListModel(config, schema[0], 'en'),
	now: new Date('2026-06-01T00:00:00Z'),
	pb: new PocketBase('http://pb.test'),
	schema,
	uiLocale: 'en',
}

function cell(type: string, value: unknown, fieldConfig?: FieldConfig, expand?: Record<string, unknown>) {
	const record = { collectionId: 'p', collectionName: 'posts', expand, id: 'r1', value } as unknown as RecordModel
	return listCell({ config: fieldConfig, field: { name: 'value', type }, key: 'value', label: 'V' }, record, context)
}

describe('listCell', () => {
	it.each([undefined, '', JSON.parse('null')])('is empty for %j', value => {
		expect(cell('text', value)).toEqual({ kind: 'empty' })
	})

	it('shows the text of rich text, without running anything in it', () => {
		expect(cell('editor', '<h2>Hi</h2><p>there &amp; <img src="x" onerror="alert(1)">bye</p>')).toEqual({
			kind: 'text',
			text: 'Hi there & bye',
		})
	})

	it('shortens long text', () => {
		const result = cell('text', 'a'.repeat(200))

		expect(result).toEqual({ kind: 'text', text: `${'a'.repeat(120)}…` })
	})

	it('shows a day as the same day in every time zone, and a date and time with the time', () => {
		expect(cell('date', '2026-01-31 00:00:00.000Z', { widget: 'date' })).toEqual({
			dateTime: '2026-01-31T00:00:00.000Z',
			kind: 'date',
			text: 'Jan 31, 2026',
		})
		expect(cell('autodate', '2026-01-31 12:34:00.000Z')).toMatchObject({ text: expect.stringMatching(/:34/) })
	})

	it('shows yes or no for a bool, or its badge when true', () => {
		expect(cell('bool', false)).toEqual({ kind: 'text', text: 'No' })
		expect(cell('bool', true, { badge: 'Pinned' })).toEqual({ badge: 'Pinned', kind: 'badge' })
		expect(cell('bool', false, { badge: 'Pinned' })).toEqual({ kind: 'empty' })
	})

	it('shows the labels of select values', () => {
		expect(cell('select', ['north', 'west'], { options: { north: 'North' } })).toEqual({
			kind: 'text',
			text: 'North, west',
		})
		expect(cell('select', [])).toEqual({ kind: 'empty' })
	})

	it('links only web addresses', () => {
		expect(cell('url', 'https://example.com/')).toEqual({ href: 'https://example.com/', kind: 'link' })
		expect(cell('url', 'javascript:alert(1)')).toEqual({ kind: 'text', text: 'javascript:alert(1)' })
	})

	it('shows images as thumbnails and other files by name', () => {
		expect(cell('file', ['a.png', 'b.pdf'])).toEqual({
			files: [
				{ name: 'a.png', thumbnail: 'http://pb.test/api/files/p/r1/a.png?thumb=100x100' },
				{ name: 'b.pdf', thumbnail: undefined },
			],
			kind: 'files',
		})
	})

	it('names related records by their title', () => {
		const expand = { value: [{ collectionName: 'categories', id: 'c1', label: 'Coffee' }] }

		expect(cell('relation', ['c1'], undefined, expand)).toEqual({ kind: 'text', text: 'Coffee' })
	})

	it('names a related record outside the CMS by displayField or a usual name field', () => {
		const user = { collectionName: 'users', email: 'a@example.com', id: 'u1', nickname: 'Al' }

		expect(cell('relation', 'u1', undefined, { value: user })).toMatchObject({ text: 'a@example.com' })
		expect(cell('relation', 'u1', { displayField: 'nickname' }, { value: user })).toMatchObject({ text: 'Al' })
	})

	it('shows the id of a related record it may not read', () => {
		expect(cell('relation', 'u1')).toEqual({ kind: 'text', text: 'u1' })
	})

	it('shows the image of a related media record', () => {
		const expand = {
			value: { alt: 'Beans', collectionId: 'm', collectionName: 'media', file: 'beans.jpg', id: 'm1' },
		}

		expect(cell('relation', 'm1', undefined, expand)).toEqual({
			files: [{ name: 'Beans', thumbnail: 'http://pb.test/api/files/m/m1/beans.jpg?thumb=100x100' }],
			kind: 'files',
		})
	})
})
