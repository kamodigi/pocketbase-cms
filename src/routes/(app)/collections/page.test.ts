import { isHttpError, isRedirect } from '@sveltejs/kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import { pb } from '#lib/pocketbase.js'

import { load } from './[collection]/+page'

const cms: CmsConfig = {
	collections: { about: { singleton: true }, posts: { list: { columns: ['title', 'created'], perPage: 2 } } },
	version: 1,
}
const schema: SchemaCollection[] = ['about', 'posts'].map(name => ({
	fields: [
		{ name: 'title', type: 'text' },
		{ name: 'created', type: 'autodate' },
	],
	name,
}))

function page(items: unknown[], totalPages: number) {
	return { items, page: 1, perPage: 2, totalItems: totalPages * 2, totalPages }
}

function requested(fetch: ReturnType<typeof serve>): URL {
	return new URL(String(fetch.mock.calls[0]?.[0]), 'http://localhost')
}

async function run(collection: string, query = '') {
	const event = {
		params: { collection },
		parent: async () => ({ cms, schema }),
		url: new URL(`http://localhost/cms/#/collections/${collection}${query}`),
	} as unknown as Parameters<typeof load>[0]
	try {
		return { data: await load(event) }
	} catch (error) {
		return { thrown: error }
	}
}

function serve(status: number, body: unknown) {
	const respond = async () => Response.json(body, { status })
	const fetch = vi.fn<typeof globalThis.fetch>(respond)
	vi.stubGlobal('fetch', fetch)
	return fetch
}

beforeEach(() => pb.authStore.save('token', { collectionId: 'c', collectionName: 'users', id: 'u1', role: 'editor' }))
afterEach(() => vi.unstubAllGlobals())

describe('the collection screen', () => {
	it('asks PocketBase for the page, search and order in the URL', async () => {
		const fetch = serve(200, page([{ id: 'p1' }], 3))
		const { data } = await run('posts', '?q=bean&page=2&sort=created')

		const url = requested(fetch)
		expect(url.pathname).toBe('/api/collections/posts/records')
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			filter: '(title ~ "%bean%")',
			page: '2',
			perPage: '2',
			sort: 'created,id',
		})
		expect(data?.list?.result.items).toEqual([{ id: 'p1' }])
	})

	it('goes to the last page when asked for one past it', async () => {
		serve(200, page([], 3))
		const { thrown } = await run('posts', '?page=9')

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/collections\/posts\?page=3$/)
	})

	it('skips the list of a single page and opens its record', async () => {
		serve(200, page([{ id: 'only' }], 1))
		const { thrown } = await run('about')

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/collections\/about\/only$/)
	})

	it('has no list for a single page without a record', async () => {
		serve(200, page([], 0))
		const { data } = await run('about')

		expect(data).toEqual({})
	})

	it.each(['about', 'posts'])('signs out when PocketBase refuses the token (%s)', async collection => {
		serve(401, { message: 'no' })
		const { thrown } = await run(collection)

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/login$/)
		expect(pb.authStore.token).toBe('')
	})

	it('shows other failures and keeps the session', async () => {
		serve(403, { message: 'Only superusers can perform this action.' })
		const { thrown } = await run('posts')

		expect(isHttpError(thrown) && thrown.status).toBe(403)
		expect(pb.authStore.token).toBe('token')
	})

	it('does not know a collection outside the config', async () => {
		const { thrown } = await run('secrets')

		expect(isHttpError(thrown) && thrown.status).toBe(404)
	})
})
