import PocketBase, { ClientResponseError } from 'pocketbase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type PocketBaseServer, startPocketBase } from '../pocketbase'
import { anonymous, asEditor, asNewUser, asSuperuser, uniqueId } from './clients'

interface TokenResponse {
	expiresAt: string
	token: string
}

const config = { 'cms/config.json': 'examples/lantern-coffee/cms.config.json' }

const issueToken = (pb: PocketBase, collection: string, id: string) =>
	pb.send<TokenResponse>(`/api/cms/preview/${collection}/${id}/token`, { method: 'POST' })

const readPreview = async (url: string, collection: string, id: string, token?: string) =>
	fetch(`${url}/api/cms/preview/${collection}/${id}`, {
		headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
	})

const statusFor = async (request: Promise<unknown>) => {
	try {
		await request
	} catch (error) {
		if (error instanceof ClientResponseError) return error.status
		throw error
	}
	return 200
}

const tokenStatus = async (pb: PocketBase, collection: string, id: string) => statusFor(issueToken(pb, collection, id))

const previewStatus = async (url: string, collection: string, id: string, token?: string) => {
	const response = await readPreview(url, collection, id, token)
	return response.status
}

const createDraft = async (editor: PocketBase, body = '<p>Draft</p>') =>
	editor.collection('posts').create({ body, draft: true, slug: uniqueId(), title: 'Draft post' })

// hooks/pb_hooks/pbcms_preview.pb.js, or pbcms/preview.go with PBCMS_POCKETBASE=go.
describe('preview tokens and GET /api/cms/preview', () => {
	let server: PocketBaseServer
	let editor: PocketBase

	beforeAll(async () => {
		server = await startPocketBase({ public: config })
		editor = await asEditor(server.url)
	})
	afterAll(() => server?.stop())

	describe('POST /api/cms/preview/{collection}/{id}/token', () => {
		it('refuses requests without a token with 401', async () => {
			const draft = await createDraft(editor)
			expect(await tokenStatus(anonymous(server.url), 'posts', draft.id)).toBe(401)
		})

		it('refuses a user without the editor role, and a superuser, with 403', async () => {
			const draft = await createDraft(editor)
			const { pb } = await asNewUser(server.url)
			expect(await tokenStatus(pb, 'posts', draft.id)).toBe(403)
			expect(await tokenStatus(await asSuperuser(server.url), 'posts', draft.id)).toBe(403)
		})

		it('answers 404 for collections the CMS does not manage, ids in place of names, and missing records', async () => {
			const draft = await createDraft(editor)
			const self = editor.authStore.record!.id
			expect(await tokenStatus(editor, 'users', self)).toBe(404)
			expect(await tokenStatus(editor, '_superusers', self)).toBe(404)
			expect(await tokenStatus(editor, 'col_posts', draft.id)).toBe(404)
			expect(await tokenStatus(editor, 'posts', 'missingrecord00')).toBe(404)
		})

		it('gives an editor a token that expires in about ten minutes', async () => {
			const draft = await createDraft(editor)
			const before = Date.now()
			const { expiresAt, token } = await issueToken(editor, 'posts', draft.id)
			expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
			const lifetime = Date.parse(expiresAt) - before
			expect(lifetime).toBeGreaterThan(590_000)
			expect(lifetime).toBeLessThan(610_000)
		})
	})

	describe('GET /api/cms/preview/{collection}/{id}', () => {
		it('returns the draft that the public cannot see, without caching', async () => {
			const draft = await createDraft(editor, '<p>Draft<script>alert(1)</script></p>')
			expect(await statusFor(anonymous(server.url).collection('posts').getOne(draft.id))).toBe(404)

			const { token } = await issueToken(editor, 'posts', draft.id)
			const response = await readPreview(server.url, 'posts', draft.id, token)
			expect(response.status).toBe(200)
			expect(response.headers.get('cache-control')).toBe('no-store')
			expect(await response.json()).toMatchObject({
				body: '<p>Draft</p>',
				collectionId: 'col_posts',
				collectionName: 'posts',
				draft: true,
				id: draft.id,
				title: 'Draft post',
			})
		})

		it('shows the record as it is now, not as it was when the token was issued', async () => {
			const draft = await createDraft(editor)
			const { token } = await issueToken(editor, 'posts', draft.id)
			await editor.collection('posts').update(draft.id, { title: 'Edited' })
			const response = await readPreview(server.url, 'posts', draft.id, token)
			expect(await response.json()).toMatchObject({ title: 'Edited' })
		})

		it('refuses a token for another record, or another collection, with 403', async () => {
			const draft = await createDraft(editor)
			const other = await createDraft(editor)
			const { token } = await issueToken(editor, 'posts', draft.id)
			expect(await previewStatus(server.url, 'posts', other.id, token)).toBe(403)
			expect(await previewStatus(server.url, 'stores', draft.id, token)).toBe(403)
			expect(await previewStatus(server.url, 'nosuchcollection', draft.id, token)).toBe(403)
		})

		it('refuses a missing, malformed or forged token, and an editor auth token, with 401', async () => {
			const draft = await createDraft(editor)
			const { token } = await issueToken(editor, 'posts', draft.id)
			const [header, payload, signature] = token.split('.', 3)
			const forged = [header, payload, `${signature.slice(0, -2)}${signature.endsWith('AA') ? 'BB' : 'AA'}`].join('.')

			expect(await previewStatus(server.url, 'posts', draft.id)).toBe(401)
			expect(await previewStatus(server.url, 'posts', draft.id, 'not-a-token')).toBe(401)
			expect(await previewStatus(server.url, 'posts', draft.id, forged)).toBe(401)
			expect(await previewStatus(server.url, 'posts', draft.id, editor.authStore.token)).toBe(401)
		})

		it('does not let the preview token act as a PocketBase auth token', async () => {
			const draft = await createDraft(editor)
			const { token } = await issueToken(editor, 'posts', draft.id)
			const response = await fetch(`${server.url}/api/collections/posts/records/${draft.id}`, {
				headers: { Authorization: token },
			})
			expect(response.status).toBe(401)
		})

		it('answers 404 once the record is deleted', async () => {
			const draft = await createDraft(editor)
			const { token } = await issueToken(editor, 'posts', draft.id)
			await editor.collection('posts').delete(draft.id)
			expect(await previewStatus(server.url, 'posts', draft.id, token)).toBe(404)
		})

		it('stops accepting the tokens of an editor who loses the role', async () => {
			const { id, pb } = await asNewUser(server.url)
			const admin = await asSuperuser(server.url)
			await admin.collection('users').update(id, { role: 'editor' })
			const draft = await createDraft(editor)
			const { token } = await issueToken(pb, 'posts', draft.id)
			expect(await previewStatus(server.url, 'posts', draft.id, token)).toBe(200)

			await admin.collection('users').update(id, { role: '' })
			expect(await previewStatus(server.url, 'posts', draft.id, token)).toBe(401)
		})
	})
})

describe('with PBCMS_PREVIEW_TOKEN_DURATION', () => {
	let server: PocketBaseServer

	beforeAll(async () => {
		server = await startPocketBase({ env: { PBCMS_PREVIEW_TOKEN_DURATION: '2' }, public: config })
	})
	afterAll(() => server?.stop())

	it('refuses the token with 401 once it has expired', async () => {
		const editor = await asEditor(server.url)
		const draft = await createDraft(editor)
		const { expiresAt, token } = await issueToken(editor, 'posts', draft.id)
		expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(2000)
		expect(await previewStatus(server.url, 'posts', draft.id, token)).toBe(200)

		await new Promise(resolve => setTimeout(resolve, 3500))
		expect(await previewStatus(server.url, 'posts', draft.id, token)).toBe(401)
	})
})
