import { describe, expect, it } from 'vitest'

import { anonymous, asEditor, asNewUser, mediaForm, uniqueId } from './clients'

// The rules of examples/lantern-coffee/pb_migrations/1790000100_create_media.js: public, editors write.
describe('media', () => {
	it('lets editors upload, update and delete images, which anyone can see', async () => {
		const editor = await asEditor()
		const alt = uniqueId()
		const { id } = await editor.collection('media').create(mediaForm(alt))

		await expect(anonymous().collection('media').getOne(id)).resolves.toMatchObject({ alt })
		await expect(editor.collection('media').update(id, { caption: 'A pixel' })).resolves.toMatchObject({
			caption: 'A pixel',
		})
		await expect(editor.collection('media').delete(id)).resolves.toBe(true)
	})

	it('rejects writes from anonymous visitors and from users who are not editors', async () => {
		const { pb: user } = await asNewUser()
		const editor = await asEditor()
		const alt = uniqueId()
		const { id } = await editor.collection('media').create(mediaForm(alt))

		for (const pb of [anonymous(), user]) {
			await expect(pb.collection('media').create(mediaForm('Spam'))).rejects.toMatchObject({ status: 400 })
			await expect(pb.collection('media').update(id, { alt: 'Defaced' })).rejects.toMatchObject({ status: 404 })
			await expect(pb.collection('media').delete(id)).rejects.toMatchObject({ status: 404 })
		}
		await expect(anonymous().collection('media').getOne(id)).resolves.toMatchObject({ alt })
	})
})
