import path from 'node:path'
import PocketBase, { ClientResponseError } from 'pocketbase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type PocketBaseServer, startPocketBase } from '../pocketbase'
import { anonymous, asEditor, asNewUser, asSuperuser } from './clients'

interface SchemaResponse {
	collections: { fields: { hidden: boolean; name: string; type: string }[]; id: string; name: string; type: string }[]
}

const fetchSchema = (pb: PocketBase) => pb.send<SchemaResponse>('/api/cms/schema', {})

const statusFor = async (pb: PocketBase) => {
	try {
		await fetchSchema(pb)
	} catch (error) {
		if (error instanceof ClientResponseError) return error.status
		throw error
	}
	return 200
}

// hooks/pb_hooks/pbcms_schema.pb.js. Each PocketBase here serves its own config, so none of them is
// the shared one.
describe('GET /api/cms/schema', () => {
	describe('with the site config in pb_public/cms/config.json', () => {
		let server: PocketBaseServer

		beforeAll(async () => {
			server = await startPocketBase({ public: { 'cms/config.json': 'examples/lantern-coffee/cms.config.json' } })
		})
		afterAll(() => server?.stop())

		it('refuses requests without a token with 401', async () => {
			expect(await statusFor(anonymous(server.url))).toBe(401)
		})

		it('refuses a user without the editor role, and a superuser, with 403', async () => {
			const { pb } = await asNewUser(server.url)
			expect(await statusFor(pb)).toBe(403)
			expect(await statusFor(await asSuperuser(server.url))).toBe(403)
		})

		it('gives an editor the collections the config names, in its order', async () => {
			const { collections } = await fetchSchema(await asEditor(server.url))
			expect(collections.map(c => c.name)).toEqual(['posts', 'stores', 'about', 'media'])

			const posts = collections[0]
			expect(Object.keys(posts).toSorted((a, b) => a.localeCompare(b))).toEqual(['fields', 'id', 'name', 'type'])
			expect(posts).toMatchObject({ id: 'col_posts', type: 'base' })
			expect(posts.fields.map(f => f.name)).toEqual([
				'id',
				'title',
				'slug',
				'body',
				'cover',
				'category',
				'pinned',
				'draft',
				'published_at',
				'created',
				'updated',
			])
			expect(posts.fields.find(f => f.name === 'category')).toMatchObject({
				maxSelect: 1,
				type: 'select',
				values: ['news', 'event', 'journal'],
			})
			expect(posts.fields.find(f => f.name === 'cover')).toMatchObject({ collectionId: 'col_media', type: 'relation' })
		})
	})

	describe('with PBCMS_CONFIG_PATH', () => {
		let server: PocketBaseServer

		beforeAll(async () => {
			const config = path.resolve('tests/integration/fixtures/schema-config.json')
			server = await startPocketBase({ env: { PBCMS_CONFIG_PATH: config } })
		})
		afterAll(() => server?.stop())

		it('reads the config there; skips unknown names, ids and system collections; adds the media collection', async () => {
			const { collections } = await fetchSchema(await asEditor(server.url))
			expect(collections.map(c => c.name)).toEqual(['stores', 'users', 'media'])

			const users = collections[1]
			expect(users.type).toBe('auth')
			const names = users.fields.map(f => f.name)
			expect(names).toContain('email')
			expect(names).toContain('role')
			expect(names).not.toContain('password')
			expect(names).not.toContain('tokenKey')
			expect(users.fields.every(f => !f.hidden)).toBe(true)
		})
	})

	describe('without a config', () => {
		let server: PocketBaseServer

		beforeAll(async () => {
			server = await startPocketBase()
		})
		afterAll(() => server?.stop())

		it('answers 500 to an editor and still 401 to anyone else', async () => {
			expect(await statusFor(await asEditor(server.url))).toBe(500)
			expect(await statusFor(anonymous(server.url))).toBe(401)
		})
	})
})
