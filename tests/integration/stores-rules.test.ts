import { describe, expect, it } from 'vitest'

import { anonymous, asEditor, asNewUser, uniqueId } from './clients'

// The rules of examples/lantern-coffee/pb_migrations/1790000300_create_stores.js: public, editors write.
describe('stores', () => {
	it('lets editors create, update and delete stores, which anyone can list', async () => {
		const editor = await asEditor()
		const name = uniqueId()
		const { id } = await editor.collection('stores').create({ name, region: 'north' })

		const listed = await anonymous()
			.collection('stores')
			.getFullList({ filter: `name = "${name}"` })
		expect(listed.map(record => record.id)).toEqual([id])

		await expect(editor.collection('stores').update(id, { region: 'west' })).resolves.toMatchObject({ region: 'west' })
		await expect(editor.collection('stores').delete(id)).resolves.toBe(true)
	})

	it('rejects writes from anonymous visitors and from users who are not editors', async () => {
		const { pb: user } = await asNewUser()
		const editor = await asEditor()
		const name = uniqueId()
		const { id } = await editor.collection('stores').create({ name, region: 'south' })

		for (const pb of [anonymous(), user]) {
			await expect(pb.collection('stores').create({ name: uniqueId(), region: 'east' })).rejects.toMatchObject({
				status: 400,
			})
			await expect(pb.collection('stores').update(id, { name: 'Defaced' })).rejects.toMatchObject({ status: 404 })
			await expect(pb.collection('stores').delete(id)).rejects.toMatchObject({ status: 404 })
		}
		await expect(anonymous().collection('stores').getOne(id)).resolves.toMatchObject({ name })
	})
})
