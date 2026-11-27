import { describe, expect, it } from 'vitest'

import { type ListQuery, parseListQuery, serializeListQuery } from './query'

const empty: ListQuery = { page: 1, search: '', sort: '', status: '' }

describe('the list query in the URL', () => {
	it('is left out for the first page of the unfiltered list', () => {
		expect(serializeListQuery(empty)).toBe('')
		expect(parseListQuery('#/collections/posts')).toEqual(empty)
	})

	it.each(['autumn blend', '100% & more', 'a+b=c#d?e', '*stars* %2A ~', '秋の新作', String.raw`it's \ "quoted"`, '😀'])(
		'keeps the search %s, whether or not the hash was decoded on the way',
		search => {
			const query: ListQuery = { page: 3, search, sort: '-updated', status: 'draft' }
			const hash = `#/collections/posts${serializeListQuery(query)}`

			expect(hash).not.toContain('%')
			expect(parseListQuery(hash)).toEqual(query)
			// SvelteKit decodes the whole hash when the app starts.
			expect(parseListQuery(decodeURIComponent(hash))).toEqual(query)
		},
	)

	it('drops values that make no sense', () => {
		expect(parseListQuery('#/collections/posts?page=-2&status=gone')).toEqual(empty)
		expect(parseListQuery('#/collections/posts?page=1.5')).toEqual(empty)
		expect(parseListQuery('#/collections/posts?q=*zz').search).toBe('*zz')
	})
})
