import { describe, expect, it, vi } from 'vitest'

import { loadConfig } from './load'

function respondWith(body: string, status = 200) {
	return vi.fn<typeof fetch>(async () => new Response(body, { status }))
}

describe('loadConfig', () => {
	it('fetches config.json without trusting the cache and validates it', async () => {
		const config = { collections: { posts: {} }, version: 1 }
		const fetchFn = respondWith(JSON.stringify(config))

		await expect(loadConfig(fetchFn)).resolves.toEqual({ config, ok: true })
		expect(fetchFn).toHaveBeenCalledWith('config.json', { cache: 'no-cache' })
	})

	it('returns the validation errors of an invalid config', async () => {
		await expect(loadConfig(respondWith('{"version":1}'))).resolves.toEqual({
			errors: [{ message: 'missing required key "collections"', path: '' }],
			ok: false,
		})
	})

	it('explains where the file goes when it is missing', async () => {
		await expect(loadConfig(respondWith('', 404))).resolves.toEqual({
			errors: [
				{ message: 'config.json was not found. Copy your cms.config.json to pb_public/cms/config.json.', path: '' },
			],
			ok: false,
		})
	})

	it('reports other HTTP errors', async () => {
		const result = await loadConfig(respondWith('', 500))
		expect(result).toEqual({ errors: [{ message: 'Could not fetch config.json: HTTP 500', path: '' }], ok: false })
	})

	it('reports a network failure', async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => {
			throw new TypeError('Failed to fetch')
		})
		const result = await loadConfig(fetchFn)
		expect(result).toEqual({
			errors: [{ message: 'Could not fetch config.json: Failed to fetch', path: '' }],
			ok: false,
		})
	})

	it('reports JSON syntax errors', async () => {
		const result = await loadConfig(respondWith('{"version": 1,}'))
		expect(result.ok).toBe(false)
		expect(!result.ok && result.errors[0]?.message).toMatch(/^config\.json is not valid JSON: /)
	})
})
