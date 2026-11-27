import { isHttpError, isRedirect } from '@sveltejs/kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigResult } from '#lib/config/index.js'

import { pb } from '#lib/pocketbase.js'

import { load } from './+layout'

const config: ConfigResult = {
	config: {
		collections: { missing: {}, posts: { label: 'Posts' } },
		nav: [{ items: ['posts', 'missing'] }],
		version: 1,
	},
	ok: true,
}

const schema = { collections: [{ fields: [{ name: 'title', type: 'text' }], id: 'p', name: 'posts', type: 'base' }] }

async function run(result: ConfigResult = config) {
	const event = { parent: async () => ({ config: result }) } as unknown as Parameters<typeof load>[0]
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

function signInAs(role: string) {
	pb.authStore.save(token(), { collectionId: 'c', collectionName: 'users', id: 'u1', role })
}

function token(): string {
	const exp = Math.floor(Date.now() / 1000) + 3600
	return `e30.${btoa(JSON.stringify({ exp, type: 'auth' }))}.signature`
}

beforeEach(() => pb.authStore.clear())
afterEach(() => vi.unstubAllGlobals())

describe('the signed-in layout', () => {
	it('sends a visitor without a session to the sign-in screen', async () => {
		const fetch = serve(200, schema)
		const { thrown } = await run()

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/login$/)
		expect(fetch).not.toHaveBeenCalled()
	})

	it('sends a signed-in user who is not an editor to the sign-in screen, signed out', async () => {
		serve(200, schema)
		signInAs('')
		const { thrown } = await run()

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/login$/)
		expect(pb.authStore.token).toBe('')
	})

	it.each([401, 403])('signs out and goes to the sign-in screen when the schema answers %i', async status => {
		serve(status, { message: 'no' })
		signInAs('editor')
		const { thrown } = await run()

		expect(isRedirect(thrown) && thrown.location).toMatch(/#\/login$/)
		expect(pb.authStore.token).toBe('')
	})

	it('shows an error and keeps the session when the schema cannot be loaded', async () => {
		serve(500, { message: 'The CMS config could not be read on the server.' })
		signInAs('editor')
		const { thrown } = await run()

		expect(isHttpError(thrown) && [thrown.status, thrown.body.message]).toEqual([
			500,
			'The CMS config could not be read on the server.',
		])
		expect(pb.authStore.token).not.toBe('')
	})

	it('gives an editor the config reconciled with the schema', async () => {
		const fetch = serve(200, schema)
		signInAs('editor')
		const { data } = await run()

		expect(String(fetch.mock.calls[0]?.[0])).toMatch(/\/api\/cms\/schema$/)
		expect(Object.keys(data?.cms?.collections ?? {})).toEqual(['posts'])
		expect(data?.cms?.nav).toEqual([{ items: ['posts'] }])
		expect(data?.warnings).toEqual([expect.objectContaining({ path: '/collections/missing' })])
	})

	it('does nothing while the config itself is broken; the root layout shows its errors', async () => {
		const fetch = serve(200, schema)
		const { data } = await run({ errors: [{ message: 'bad', path: '' }], ok: false })

		expect(data?.cms).toBeUndefined()
		expect(fetch).not.toHaveBeenCalled()
	})
})
