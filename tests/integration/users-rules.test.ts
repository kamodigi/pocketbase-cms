import { describe, expect, it } from 'vitest'

import { anonymous, asEditor, asNewUser, asSuperuser, uniqueId } from './clients'

// The rules of examples/lantern-coffee/pb_migrations/1790000000_add_users_role.js,
// and PocketBase's default list and view rules for users, which it keeps.
describe('users', () => {
	it('rejects sign-ups', async () => {
		const email = `${uniqueId()}@example.com`
		const password = 'password1234'

		await expect(
			anonymous().collection('users').create({ email, password, passwordConfirm: password }),
		).rejects.toMatchObject({ status: 403 })

		const admin = await asSuperuser()
		const found = await admin.collection('users').getList(1, 1, { filter: admin.filter('email = {:email}', { email }) })
		expect(found.totalItems).toBe(0)
	})

	it('rejects users who try to make themselves editors', async () => {
		const { id, pb } = await asNewUser()

		await expect(pb.collection('users').update(id, { role: 'editor' })).rejects.toMatchObject({ status: 404 })

		const admin = await asSuperuser()
		expect(await admin.collection('users').getOne(id)).toMatchObject({ role: '' })
	})

	it('rejects editors who try to promote or edit someone else', async () => {
		const { id } = await asNewUser()
		const editor = await asEditor()

		await expect(editor.collection('users').update(id, { role: 'editor' })).rejects.toMatchObject({ status: 404 })
		await expect(editor.collection('users').update(id, { name: 'Renamed' })).rejects.toMatchObject({ status: 404 })

		const admin = await asSuperuser()
		expect(await admin.collection('users').getOne(id)).toMatchObject({ name: '', role: '' })
	})

	it('lets users edit their own profile but not anyone else’s', async () => {
		const { id, pb } = await asNewUser()
		const { id: otherId } = await asNewUser()

		await expect(pb.collection('users').update(id, { name: 'New Name' })).resolves.toMatchObject({ name: 'New Name' })
		await expect(pb.collection('users').update(otherId, { name: 'Renamed' })).rejects.toMatchObject({ status: 404 })
	})

	it('shows each user only their own account', async () => {
		const { id, pb: user } = await asNewUser()
		const editor = await asEditor()

		expect(await anonymous().collection('users').getFullList()).toEqual([])
		const seenByUser = await user.collection('users').getFullList()
		expect(seenByUser.map(record => record.id)).toEqual([id])
		const seenByEditor = await editor.collection('users').getFullList()
		expect(seenByEditor.map(record => record.id)).toEqual([editor.authStore.record?.id])
		await expect(editor.collection('users').getOne(id)).rejects.toMatchObject({ status: 404 })
	})

	it('rejects users who try to delete their own account', async () => {
		const { id, pb } = await asNewUser()

		await expect(pb.collection('users').delete(id)).rejects.toMatchObject({ status: 403 })

		const admin = await asSuperuser()
		await expect(admin.collection('users').getOne(id)).resolves.toMatchObject({ id })
	})
})
