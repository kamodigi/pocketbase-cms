import { describe, expect, it, onTestFinished } from 'vitest'

import { anonymous, asEditor, asNewUser, asSuperuser } from './clients'

// The single record that the migration creates. Only this file may change it, since test files run in parallel.
async function theRecord() {
	const admin = await asSuperuser()
	const records = await admin.collection('about').getFullList()
	expect(records).toHaveLength(1)
	return records[0]
}

// The rules of examples/lantern-coffee/pb_migrations/1790000400_create_about.js: a single page.
describe('about', () => {
	it('is readable by anyone', async () => {
		const { id } = await theRecord()
		const pb = anonymous()

		await expect(pb.collection('about').getOne(id)).resolves.toMatchObject({ id })
		const records = await pb.collection('about').getFullList()
		expect(records.map(record => record.id)).toEqual([id])
	})

	it('lets editors update the page', async () => {
		const { id, title } = await theRecord()
		onTestFinished(async () => {
			const admin = await asSuperuser()
			await admin.collection('about').update(id, { title })
		})
		const pb = await asEditor()

		await expect(pb.collection('about').update(id, { title: `${title} (edited)` })).resolves.toMatchObject({
			title: `${title} (edited)`,
		})
	})

	it('rejects editors who try to create a second record or delete the page', async () => {
		const { id } = await theRecord()
		const pb = await asEditor()

		await expect(pb.collection('about').create({ title: 'Another page' })).rejects.toMatchObject({ status: 403 })
		await expect(pb.collection('about').delete(id)).rejects.toMatchObject({ status: 403 })

		await theRecord()
	})

	it('rejects updates from anonymous visitors and from users who are not editors', async () => {
		const { id, title } = await theRecord()
		const { pb: user } = await asNewUser()

		for (const pb of [anonymous(), user]) {
			await expect(pb.collection('about').update(id, { title: 'Defaced' })).rejects.toMatchObject({ status: 404 })
		}
		expect(await theRecord()).toMatchObject({ title })
	})
})
