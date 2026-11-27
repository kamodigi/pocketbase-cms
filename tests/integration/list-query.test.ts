// The filters and sorts the list screen sends, checked against a real PocketBase.
import { beforeAll, describe, expect, it } from 'vitest'

import type { ListModel } from '../../src/lib/list/model'
import type { ListQuery, PublishState } from '../../src/lib/list/query'

import { listFilter, listSort, publishState } from '../../src/lib/list/request'
import { asEditor, uniqueId } from './clients'

const tag = uniqueId()
const status = { draftField: 'draft', publishedAtField: 'published_at' }
const model: ListModel = {
	columns: [],
	defaultSort: '-published_at',
	perPage: 30,
	searchFields: ['title', 'slug'],
	status,
}

const posts = [
	{ published_at: '', slug: `${tag}-a`, title: `${tag} 100% arabica` },
	{ published_at: '2020-01-01 00:00:00.000Z', slug: `${tag}-b`, title: `${tag} 100 days` },
	{ published_at: '2999-01-01 00:00:00.000Z', slug: `${tag}-c`, title: `${tag} snake_case` },
	{ draft: true, published_at: '2021-01-01 00:00:00.000Z', slug: `${tag}-d`, title: `${tag} snakeXcase` },
	{ draft: true, published_at: '', slug: `${tag}-e`, title: String.raw`${tag} it's a back\slash "quote"` },
	{ published_at: '2022-01-01 00:00:00.000Z', slug: `${tag}-f`, title: `${tag} 焙煎のお知らせ` },
	{ draft: true, published_at: '', slug: `${tag}-g`, title: String.raw`${tag} C:\%temp\_` },
]

const byText = (a: string, b: string) => a.localeCompare(b)
const editor = asEditor()

async function find(query: Partial<ListQuery>) {
	const full: ListQuery = { page: 1, search: '', sort: '', status: '', ...query }
	// Other tests' posts are in the same collection.
	const pb = await editor
	const filter = [`slug ~ "${tag}"`, listFilter(pb, model, full)].filter(Boolean).join(' && ')
	return pb.collection('posts').getFullList({ filter, sort: listSort(model, full) })
}

async function suffixes(query: Partial<ListQuery>) {
	const records = await find(query)
	return records.map(record => String(record.slug).slice(-1))
}

beforeAll(async () => {
	const pb = await editor
	for (const post of posts) await pb.collection('posts').create(post)
})

describe('the search of the list screen', () => {
	it.each([
		['100%', ['a']],
		['%', ['a', 'g']],
		['snake_case', ['c']],
		['_', ['c', 'g']],
		[String.raw`back\slash`, ['e']],
		['\\', ['e', 'g']],
		[String.raw`\%`, ['g']],
		[String.raw`\_`, ['g']],
		['%temp\\', ['g']],
		["it's", ['e']],
		['"quote"', ['e']],
		['焙煎', ['f']],
		['ARABICA', ['a']],
		['no such text', []],
		[`a' || title != '`, []],
		['a" || title != "', []],
	])('finds %j as plain text', async (search, expected) => {
		const found = await suffixes({ search })

		expect(found.toSorted(byText)).toEqual(expected)
	})
})

describe('the publish state filter', () => {
	it.each([
		['draft', ['d', 'e', 'g']],
		['published', ['a', 'b', 'f']],
		['scheduled', ['c']],
	] as [PublishState, string[]][])('lists the %s posts, as the badge reads them', async (state, expected) => {
		const records = await find({ status: state })

		expect(records.map(record => String(record.slug).slice(-1)).toSorted(byText)).toEqual(expected)
		expect(records.map(record => publishState(record, status, new Date()))).toEqual(expected.map(() => state))
	})
})

describe('the sort', () => {
	it('puts the newest first by default, and the oldest first when asked', async () => {
		const newest = await suffixes({})
		const oldest = await suffixes({ sort: 'published_at' })

		expect(newest.slice(0, 4)).toEqual(['c', 'f', 'd', 'b'])
		expect(oldest.slice(-4)).toEqual(['b', 'd', 'f', 'c'])
	})
})
