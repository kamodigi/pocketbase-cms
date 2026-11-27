import PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'

import type { ListModel } from './model'

import { listFilter, listSort, publishState } from './request'

const pb = new PocketBase('/')
const model: ListModel = {
	columns: [],
	defaultSort: '-published_at',
	perPage: 20,
	searchFields: ['name', 'address'],
	status: { draftField: 'draft', publishedAtField: 'published_at' },
}
const query = { page: 1, search: '', sort: '', status: '' } as const

describe('listFilter', () => {
	it('is empty without a search or a state', () => {
		expect(listFilter(pb, model, query)).toBe('')
	})

	it('matches the text in any search field', () => {
		expect(listFilter(pb, model, { ...query, search: 'bean' })).toBe('(name ~ "%bean%" || address ~ "%bean%")')
	})

	it('quotes the text and keeps "%", "_" and a backslash plain characters', () => {
		const filter = listFilter(pb, { ...model, searchFields: ['name'] }, { ...query, search: '"5%_\\' })

		expect(filter).toBe(`(name ~ ${JSON.stringify(String.raw`%"5\%\_\\%`)})`)
	})

	it('ignores a search when no field can be searched', () => {
		expect(listFilter(pb, { ...model, searchFields: [] }, { ...query, search: 'x' })).toBe('')
	})

	it.each([
		['draft', 'draft = true'],
		['published', 'draft = false && (published_at = "" || published_at <= @now)'],
		['scheduled', 'draft = false && published_at > @now'],
	] as const)('filters %s records by a draft field', (status, filter) => {
		expect(listFilter(pb, model, { ...query, status })).toBe(filter)
	})

	it.each([
		['draft', 'published = false'],
		['published', 'published = true'],
	] as const)('filters %s records by a published field', (status, filter) => {
		const published = { ...model, status: { publishedField: 'published' } }

		expect(listFilter(pb, published, { ...query, status })).toBe(filter)
	})

	it('combines the search and the state', () => {
		expect(listFilter(pb, { ...model, searchFields: ['name'] }, { ...query, search: 'a', status: 'draft' })).toBe(
			'(name ~ "%a%") && draft = true',
		)
	})
})

describe('listSort', () => {
	it('uses the configured order unless the user chose one, and ends with the id', () => {
		expect(listSort(model, query)).toBe('-published_at,id')
		expect(listSort(model, { ...query, sort: 'updated' })).toBe('updated,id')
		expect(listSort({ ...model, defaultSort: '' }, query)).toBe('id')
	})

	it.each(['@random', 'name,-id'])('adds nothing to %s', defaultSort => {
		expect(listSort({ ...model, defaultSort }, query)).toBe(defaultSort)
	})
})

describe('publishState', () => {
	const now = new Date('2026-06-01T00:00:00Z')
	const status = { draftField: 'draft', publishedAtField: 'at' }

	it.each([
		[{ at: '', draft: true }, 'draft'],
		[{ at: '2030-01-01 00:00:00.000Z', draft: true }, 'draft'],
		[{ at: '2030-01-01 00:00:00.000Z', draft: false }, 'scheduled'],
		[{ at: '2026-06-01 00:00:00.000Z', draft: false }, 'published'],
		[{ at: '', draft: false }, 'published'],
	])('reads %o as %s', (record, state) => {
		expect(publishState(record, status, now)).toBe(state)
	})

	it('reads a published field the other way round', () => {
		expect(publishState({ live: false }, { publishedField: 'live' }, now)).toBe('draft')
		expect(publishState({ live: true }, { publishedField: 'live' }, now)).toBe('published')
	})
})
