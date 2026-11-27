import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type PocketBaseServer, startPocketBase } from '../pocketbase'

// The CMS's index.html names its files relative to itself, so opened as /edit it would ask for /_app/…
// It relies on PocketBase redirecting a folder of pb_public to its address with a trailing slash.
describe('a folder of pb_public opened without the trailing slash', () => {
	let server: PocketBaseServer

	beforeAll(async () => {
		const index = 'tests/integration/fixtures/folder-index.html'
		server = await startPocketBase({
			public: { 'cms/index.html': index, 'sites/lantern-editor/index.html': index },
		})
	})
	afterAll(() => server.stop())

	it.each(['/cms', '/sites/lantern-editor'])('redirects %s to the folder', async folder => {
		const response = await fetch(`${server.url}${folder}`, { redirect: 'manual' })

		expect(response.status).toBe(301)
		expect(response.headers.get('location')).toBe(`${folder}/`)
	})
})
