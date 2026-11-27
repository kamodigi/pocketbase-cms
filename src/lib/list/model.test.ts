import { describe, expect, it } from 'vitest'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import { buildListModel, normalizeListQuery, offeredStates } from './model'

const events: SchemaCollection = {
	fields: [
		{ name: 'id', primaryKey: true, type: 'text' },
		{ name: 'title_ja', type: 'text' },
		{ name: 'title_en', type: 'text' },
		{ name: 'published', type: 'bool' },
		{ name: 'starts_at', type: 'date' },
		{ name: 'created', type: 'autodate' },
		{ name: 'updated', type: 'autodate' },
	],
	name: 'events',
}
const query = { page: 1, search: '', sort: '', status: '' } as const

function model(collection: CmsConfig['collections'][string] = {}, schema = events) {
	return buildListModel({ collections: { events: collection }, locales: ['ja', 'en'], version: 1 }, schema, 'en')
}

describe('buildListModel', () => {
	it('shows the title, the publish state and the last change by default', () => {
		const result = model({ status: { publishedField: 'published' } })

		expect(result.columns.map(c => [c.key, c.label])).toEqual([
			['title_ja', 'title_ja'],
			['$status', 'Status'],
			['updated', 'Updated'],
		])
		expect(result).toMatchObject({
			defaultSort: '-updated',
			perPage: 30,
			searchFields: ['title_ja'],
			titleField: 'title_ja',
		})
	})

	it('leaves out the last change when the collection has no updated field', () => {
		const fields = events.fields.filter(field => field.name !== 'updated')
		const result = model({}, { ...events, fields })

		expect(result.columns.map(c => c.key)).toEqual(['title_ja'])
		expect(result.defaultSort).toBe('-created')
	})

	it('follows the list settings', () => {
		const result = model({
			fields: { starts_at: { label: { en: 'Starts', ja: '開始' } } },
			list: { columns: ['starts_at', 'created'], perPage: 5, search: ['title_en'], sort: '-starts_at' },
		})

		expect(result.columns.map(c => c.label)).toEqual(['Starts', 'Created'])
		expect(result).toMatchObject({ defaultSort: '-starts_at', perPage: 5, searchFields: ['title_en'] })
	})

	it("shows and searches a localized field in the base locale's field", () => {
		const result = model({ fields: { title: { label: 'Title', localized: true } }, titleField: 'title' })

		expect(result.columns[0]).toMatchObject({ field: { name: 'title_ja' }, key: 'title', label: 'Title' })
		expect(result.searchFields).toEqual(['title_ja'])
		expect(result.titleField).toBe('title_ja')
	})

	it('shows the id when there is nothing else to show', () => {
		const schema = { fields: [{ name: 'id', primaryKey: true, type: 'text' }], name: 'events' }
		const result = model({}, schema)

		expect(result.columns.map(c => c.key)).toEqual(['id'])
		expect(result.searchFields).toEqual([])
	})
})

describe('what the list offers', () => {
	it('filters by state only with status, and by "scheduled" only with a publish date', () => {
		expect(offeredStates(model())).toEqual([])
		expect(offeredStates(model({ status: { publishedField: 'published' } }))).toEqual(['published', 'draft'])
		expect(offeredStates(model({ status: { publishedAtField: 'starts_at', publishedField: 'published' } }))).toEqual([
			'published',
			'scheduled',
			'draft',
		])
	})

	it('drops a state and a sort it does not offer', () => {
		const result = model({ list: { columns: ['title_ja', 'starts_at'] } })

		expect(normalizeListQuery({ ...query, sort: '-updated', status: 'draft' }, result)).toEqual(query)
		expect(normalizeListQuery({ ...query, sort: 'title_ja' }, result)).toEqual(query)
		expect(normalizeListQuery({ ...query, sort: '-starts_at' }, result).sort).toBe('-starts_at')
	})
})
