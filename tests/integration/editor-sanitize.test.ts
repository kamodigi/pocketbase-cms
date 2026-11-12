import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type PocketBaseServer, startPocketBase } from '../pocketbase'
import { anonymous, asEditor, asSuperuser, uniqueId } from './clients'

// hooks/pb_hooks/pbcms_sanitize.pb.js cleans every `editor` field before it is saved, and
// pbcms_media_urls.pb.js cleans it again in responses.
const hostile =
	'<p onclick="steal()">Hello<script>alert(1)</script> <a href="javascript:alert(1)">link</a></p>' +
	'<img src="x.png" onerror="alert(1)" width="10"><iframe src="https://evil.example"></iframe>'
const cleaned = '<p>Hello <a>link</a></p><img src="x.png" width="10">'

describe('editor fields', () => {
	it('are sanitized when an editor creates and updates a record through the API', async () => {
		const editor = await asEditor()
		const slug = uniqueId()
		const created = await editor.collection('posts').create({ body: hostile, slug, title: 'Hostile' })
		expect(created.body).toBe(cleaned)
		await expect(anonymous().collection('posts').getOne(created.id)).resolves.toMatchObject({ body: cleaned })

		const updated = await editor.collection('posts').update(created.id, { body: `<p>v2</p>${hostile}` })
		expect(updated.body).toBe(`<p>v2</p>${cleaned}`)
	})

	it('are sanitized for superusers too', async () => {
		const admin = await asSuperuser()
		const created = await admin.collection('posts').create({ body: hostile, slug: uniqueId(), title: 'Admin' })
		expect(created.body).toBe(cleaned)
	})

	it('are sanitized in every collection', async () => {
		const editor = await asEditor()
		const about = await editor.collection('about').getFirstListItem('')
		const updated = await editor.collection('about').update(about.id, { body: hostile })
		expect(updated.body).toBe(cleaned)
	})

	it('keep what the CMS editor writes', async () => {
		const editor = await asEditor()
		const body =
			'<h2>Title</h2><p style="text-align: center"><strong>bold</strong> <a href="https://example.com/" target="_blank" rel="noopener noreferrer">link</a></p>' +
			'<figure><img src="/api/files/col_media/abc123/a.webp" alt="A cup" width="1200" height="800"><figcaption>Cap</figcaption></figure>'
		const created = await editor.collection('posts').create({ body, slug: uniqueId(), title: 'Kept' })
		expect(created.body).toBe(body)
	})

	it('leave other fields alone', async () => {
		const editor = await asEditor()
		const title = '<b>Not HTML</b> & <script>'
		const created = await editor.collection('posts').create({ slug: uniqueId(), title })
		expect(created.title).toBe(title)
	})

	it('are refused when longer than 200,000 characters', async () => {
		const editor = await asEditor()
		const body = `<p>${'x'.repeat(200_000)}</p>`
		await expect(editor.collection('posts').create({ body, slug: uniqueId(), title: 'Long' })).rejects.toMatchObject({
			response: { data: { body: { code: 'pbcms_html_too_long' } } },
			status: 400,
		})
	})

	describe('written around the save hooks', () => {
		let server: PocketBaseServer

		beforeAll(async () => {
			server = await startPocketBase({ hooks: { 'raw-write.pb.js': 'tests/integration/fixtures/raw-write.pb.js' } })
		})
		afterAll(() => server?.stop())

		it('are sanitized in responses', async () => {
			const admin = await asSuperuser(server.url)
			const { id } = await admin.collection('posts').create({ slug: uniqueId(), title: 'Raw' })
			await admin.send(`/test/raw-post-body/${id}`, { body: { body: hostile }, method: 'POST' })

			const visitor = anonymous(server.url)
			await expect(visitor.collection('posts').getOne(id)).resolves.toMatchObject({ body: cleaned })
			const list = await visitor.collection('posts').getFullList({ filter: visitor.filter('id = {:id}', { id }) })
			expect(list[0].body).toBe(cleaned)
		})

		it('are emptied in responses when longer than 200,000 characters', async () => {
			const admin = await asSuperuser(server.url)
			const { id } = await admin.collection('posts').create({ slug: uniqueId(), title: 'Raw long' })
			await admin.send(`/test/raw-post-body/${id}`, { body: { body: `<p>${'x'.repeat(200_000)}</p>` }, method: 'POST' })
			await expect(anonymous(server.url).collection('posts').getOne(id)).resolves.toMatchObject({ body: '' })
		})
	})
})
