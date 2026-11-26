import PocketBase, { type RecordModel } from 'pocketbase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasEditorSession, isEditor, requestPasswordReset, signIn, signOut } from './auth'

function respond(status: number, body: unknown = {}) {
	return vi.fn<typeof globalThis.fetch>(async () => Response.json(body, { status }))
}

/**
An unsigned token that expires in an hour; the SDK only reads its payload.
*/
function token(): string {
	const exp = Math.floor(Date.now() / 1000) + 3600
	const payload = btoa(JSON.stringify({ exp, type: 'auth' }))
	return `e30.${payload}.signature`
}

function user(fields: Partial<RecordModel> = {}): RecordModel {
	return { collectionId: 'c', collectionName: 'users', id: 'u1', role: 'editor', ...fields }
}

const pb = new PocketBase('http://pocketbase.test')

beforeEach(() => pb.authStore.clear())

afterEach(() => vi.unstubAllGlobals())

describe('isEditor', () => {
	it('accepts only a users record with role "editor"', () => {
		expect(isEditor(user())).toBe(true)
		expect(isEditor(user({ role: '' }))).toBe(false)
		expect(isEditor(user({ collectionName: '_superusers' }))).toBe(false)
		// The auth store holds null when signed out.
		expect(isEditor(pb.authStore.record)).toBe(false)
	})
})

describe('hasEditorSession', () => {
	it('needs an unexpired token for an editor', () => {
		expect(hasEditorSession(pb)).toBe(false)
		pb.authStore.save(token(), user({ role: '' }))
		expect(hasEditorSession(pb)).toBe(false)
		pb.authStore.save(token(), user())
		expect(hasEditorSession(pb)).toBe(true)
		pb.authStore.save('e30.e30.signature', user())
		expect(hasEditorSession(pb)).toBe(false)
	})
})

describe('signIn', () => {
	it('keeps the session of an editor', async () => {
		const fetch = respond(200, { record: user(), token: token() })
		vi.stubGlobal('fetch', fetch)

		expect(await signIn(pb, 'editor@example.com', 'secret')).toEqual({ ok: true })
		expect(hasEditorSession(pb)).toBe(true)
		expect(String(fetch.mock.calls[0]?.[0])).toBe('http://pocketbase.test/api/collections/users/auth-with-password')
	})

	it('signs anyone else out again at once', async () => {
		vi.stubGlobal('fetch', respond(200, { record: user({ role: '' }), token: token() }))

		expect(await signIn(pb, 'viewer@example.com', 'secret')).toEqual({ ok: false, reason: 'not-editor' })
		expect(pb.authStore.token).toBe('')
	})

	it('reports wrong credentials (400) apart from other failures', async () => {
		vi.stubGlobal('fetch', respond(400, { message: 'Failed to authenticate.' }))
		expect(await signIn(pb, 'editor@example.com', 'wrong')).toEqual({ ok: false, reason: 'credentials' })

		vi.stubGlobal('fetch', respond(500))
		expect(await signIn(pb, 'editor@example.com', 'secret')).toEqual({ ok: false, reason: 'unavailable' })

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch')
			}),
		)
		expect(await signIn(pb, 'editor@example.com', 'secret')).toEqual({ ok: false, reason: 'unavailable' })
	})
})

describe('requestPasswordReset', () => {
	it("calls PocketBase's password reset request for users", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(undefined, { status: 204 }))
		vi.stubGlobal('fetch', fetch)

		expect(await requestPasswordReset(pb, 'editor@example.com')).toEqual({ ok: true })
		const [url, init] = fetch.mock.calls[0] ?? []
		expect(String(url)).toBe('http://pocketbase.test/api/collections/users/request-password-reset')
		expect(JSON.parse(String(init?.body))).toEqual({ email: 'editor@example.com' })
	})

	it('tells an invalid address (400) apart from other failures', async () => {
		vi.stubGlobal('fetch', respond(400))
		expect(await requestPasswordReset(pb, 'nope')).toEqual({ ok: false, reason: 'invalid-email' })

		vi.stubGlobal('fetch', respond(429))
		expect(await requestPasswordReset(pb, 'editor@example.com')).toEqual({ ok: false, reason: 'unavailable' })
	})
})

describe('signOut', () => {
	it('forgets the session', () => {
		pb.authStore.save(token(), user())
		signOut(pb)
		expect(pb.authStore.record).toBeNull()
		expect(hasEditorSession(pb)).toBe(false)
	})
})
