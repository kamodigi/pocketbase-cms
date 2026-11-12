import { describe, expect, it } from 'vitest'

import { anonymous, asEditor, asSuperuser, uniqueId } from './clients'

// hooks/pb_hooks/pbcms_sanitize.pb.js: every `editor` field is cleaned before it is saved.
const hostile =
	'<p onclick="steal()">Hello<script>alert(1)</script> <a href="javascript:alert(1)">link</a></p>' +
	'<img src="x.png" onerror="alert(1)" data-media-id="abc123" width="10"><iframe src="https://evil.example"></iframe>'
const cleaned = '<p>Hello <a>link</a></p><img src="x.png" data-media-id="abc123" width="10">'

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
			'<figure><img src="/api/files/col_media/abc123/a.webp" alt="A cup" width="1200" height="800" data-media-id="abc123"><figcaption>Cap</figcaption></figure>'
		const created = await editor.collection('posts').create({ body, slug: uniqueId(), title: 'Kept' })
		expect(created.body).toBe(body)
	})

	it('leave other fields alone', async () => {
		const editor = await asEditor()
		const title = '<b>Not HTML</b> & <script>'
		const created = await editor.collection('posts').create({ slug: uniqueId(), title })
		expect(created.title).toBe(title)
	})
})
