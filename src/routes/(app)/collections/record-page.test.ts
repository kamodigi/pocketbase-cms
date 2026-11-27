import { isHttpError, isRedirect } from '@sveltejs/kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CmsConfig } from '#lib/config/index.js'

import { pb } from '#lib/pocketbase.js'

import { load } from './[collection]/[id]/+page'

const cms: CmsConfig = { collections: { about: { singleton: true }, posts: {} }, version: 1 }

async function run(collection: string, id: string) {
	const event = { params: { collection, id }, parent: async () => ({ cms }) } as unknown as Parameters<typeof load>[0]
	try {
		return { data: await load(event) }
	} catch (error) {
		return { thrown: error }
	}
}

function serve(status: number, body: unknown) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(body, { status }))
	vi.stubGlobal('fetch', fetch)
	return fetch
}

beforeEach(() => pb.authStore.save('token', { collectionId: 'c', collectionName: 'users', id: 'u1', role: 'editor' }))
afterEach(() => vi.unstubAllGlobals())

describe('the record screen', () => {
	it('loads the record', async () => {
		const fetch = serve(200, { id: 'p1', title: 'Autumn' })
		const { data } = await run('posts', 'p1')

		expect(new URL(String(fetch.mock.calls[0]?.[0]), 'http://localhost').pathname).toBe(
			'/api/collections/posts/records/p1',
		)
		expect(data?.record).toMatchObject({ id: 'p1', title: 'Autumn' })
	})

	it('opens an empty form for a new record without asking PocketBase', async () => {
		const fetch = serve(200, {})
		const { data } = await run('posts', 'new')

		expect(data).toEqual({})
		expect(fetch).not.toHaveBeenCalled()
	})

	it('sends a new record of a single page back to its page', async () => {
		const { thrown } = await run('about', 'new')

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/collections\/about$/)
	})

	it('answers 404 for a record that does not exist', async () => {
		serve(404, { data: {}, message: "The requested resource wasn't found.", status: 404 })
		const { thrown } = await run('posts', 'missing')

		expect(isHttpError(thrown) && thrown.status).toBe(404)
	})

	it('signs out when the token is refused', async () => {
		serve(401, { data: {}, message: 'Unauthorized.', status: 401 })
		const { thrown } = await run('posts', 'p1')

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/login$/)
		expect(pb.authStore.token).toBe('')
	})
})
