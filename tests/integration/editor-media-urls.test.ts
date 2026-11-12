import type PocketBase from 'pocketbase'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type PocketBaseServer, startPocketBase } from '../pocketbase'
import { anonymous, asEditor, asSuperuser, mediaForm, uniqueId } from './clients'

// hooks/pb_hooks/pbcms_media_urls.pb.js: API responses point <img data-media-id> at the media
// record's current file. These tests change settings and rules, so they get their own PocketBase.
describe('images in editor fields', () => {
	let server: PocketBaseServer
	let editor: PocketBase
	let admin: PocketBase

	beforeAll(async () => {
		server = await startPocketBase()
		editor = await asEditor(server.url)
		admin = await asSuperuser(server.url)
	})
	afterAll(() => server?.stop())

	const setAppUrl = (appURL: string) => admin.settings.update({ meta: { appURL } })

	const createPost = async (mediaId: string) => {
		const body = `<p>x</p><img src="https://old.example/a.png" alt="A" data-media-id="${mediaId}" width="10"><img src="/plain.png" alt="B">`
		const { id } = await editor.collection('posts').create({ body, slug: uniqueId(), title: 'Images' })
		return id
	}

	const bodyOf = async (pb: PocketBase, id: string) => {
		const record = await pb.collection('posts').getOne(id)
		return record.body as string
	}

	it('follow a replaced file and a new Application URL; other images stay as they are', async () => {
		await setAppUrl('https://pb.example.com')
		const media = await editor.collection('media').create(mediaForm('A', 'first.png'))
		const id = await createPost(media.id)
		const visitor = anonymous(server.url)

		expect(await bodyOf(visitor, id)).toBe(
			`<p>x</p><img src="https://pb.example.com/api/files/col_media/${media.id}/${media.file}" alt="A" data-media-id="${media.id}" width="10"><img src="/plain.png" alt="B">`,
		)

		const replaced = await editor.collection('media').update(media.id, mediaForm('A', 'second.png'))
		expect(replaced.file).not.toBe(media.file)
		await setAppUrl('https://cms.example.org/')
		expect(await bodyOf(visitor, id)).toContain(
			`<img src="https://cms.example.org/api/files/col_media/${media.id}/${replaced.file}" alt="A"`,
		)

		// Lists and expanded relations are enriched the same way.
		const list = await visitor.collection('posts').getFullList({ filter: visitor.filter('id = {:id}', { id }) })
		expect(list[0].body).toContain(`/api/files/col_media/${media.id}/${replaced.file}"`)
	})

	it('are left alone when the media record is gone', async () => {
		const media = await editor.collection('media').create(mediaForm('Gone'))
		const id = await createPost(media.id)
		await editor.collection('media').delete(media.id)
		expect(await bodyOf(anonymous(server.url), id)).toContain('<img src="https://old.example/a.png"')
	})

	it('resolve only media the requester may view, and the stored HTML never changes', async () => {
		const media = await editor.collection('media').create(mediaForm('Private'))
		const id = await createPost(media.id)
		// null means superusers only.
		// eslint-disable-next-line unicorn/no-null -- PocketBase's API takes null here
		await admin.collections.update('media', { viewRule: null })
		try {
			expect(await bodyOf(editor, id)).toContain('<img src="https://old.example/a.png"')
			expect(await bodyOf(admin, id)).toContain(`/api/files/col_media/${media.id}/${media.file}"`)
		} finally {
			await admin.collections.update('media', { viewRule: '' })
		}
	})

	describe('with PBCMS_PUBLIC_URL', () => {
		let pinned: PocketBaseServer

		beforeAll(async () => {
			pinned = await startPocketBase({ env: { PBCMS_PUBLIC_URL: 'https://images.example.net/' } })
		})
		afterAll(() => pinned?.stop())

		it('takes the URL from the environment variable over the Application URL', async () => {
			const pinnedEditor = await asEditor(pinned.url)
			const media = await pinnedEditor.collection('media').create(mediaForm('Pinned'))
			const body = `<img src="old.png" data-media-id="${media.id}">`
			const { id } = await pinnedEditor.collection('posts').create({ body, slug: uniqueId(), title: 'Pinned' })

			expect(await bodyOf(anonymous(pinned.url), id)).toBe(
				`<img src="https://images.example.net/api/files/col_media/${media.id}/${media.file}" data-media-id="${media.id}">`,
			)
		})
	})
})
