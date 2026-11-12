import type PocketBase from 'pocketbase'

import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'

import { anonymous, asEditor, asNewUser, asSuperuser, uniqueId } from './clients'

// The rules of examples/lantern-coffee/pb_migrations/1790000200_create_posts.js.
describe('posts', () => {
	const tag = uniqueId()
	const posts = {
		draft: { draft: true, published_at: '' },
		future: { draft: false, published_at: '2999-01-01 00:00:00.000Z' },
		past: { draft: false, published_at: '2020-01-01 00:00:00.000Z' },
		undated: { draft: false, published_at: '' },
	}
	const ids: Record<keyof typeof posts, string> = { draft: '', future: '', past: '', undated: '' }

	beforeAll(async () => {
		const admin = await asSuperuser()
		for (const [name, fields] of Object.entries(posts)) {
			const record = await admin.collection('posts').create({ ...fields, slug: `${tag}-${name}`, title: name })
			ids[name as keyof typeof posts] = record.id
		}
	})

	const visibleTitles = async (pb: PocketBase) => {
		const records = await pb.collection('posts').getFullList({ filter: pb.filter('slug ~ {:tag}', { tag }) })
		return records.map(record => record.title).toSorted((a, b) => a.localeCompare(b))
	}

	it('shows only published posts to anonymous visitors', async () => {
		expect(await visibleTitles(anonymous())).toEqual(['past', 'undated'])
	})

	it('shows only published posts to signed-in users who are not editors', async () => {
		const { pb } = await asNewUser()
		expect(await visibleTitles(pb)).toEqual(['past', 'undated'])
	})

	it('shows drafts and scheduled posts to editors', async () => {
		expect(await visibleTitles(await asEditor())).toEqual(['draft', 'future', 'past', 'undated'])
	})

	it('hides a draft or scheduled post from non-editors who know its id', async () => {
		const { pb: user } = await asNewUser()
		for (const pb of [anonymous(), user]) {
			await expect(pb.collection('posts').getOne(ids.draft)).rejects.toMatchObject({ status: 404 })
			await expect(pb.collection('posts').getOne(ids.future)).rejects.toMatchObject({ status: 404 })
			await expect(pb.collection('posts').getOne(ids.past)).resolves.toMatchObject({ title: 'past' })
		}
	})

	it('lets editors create, update and delete posts', async () => {
		const pb = await asEditor()
		const record = await pb.collection('posts').create({ draft: true, slug: uniqueId(), title: 'Draft' })
		onTestFinished(async () => {
			const admin = await asSuperuser()
			const left = await admin
				.collection('posts')
				.getList(1, 1, { filter: admin.filter('id = {:id}', { id: record.id }) })
			if (left.totalItems > 0) await admin.collection('posts').delete(record.id)
		})

		await expect(pb.collection('posts').update(record.id, { title: 'Edited' })).resolves.toMatchObject({
			title: 'Edited',
		})
		await expect(pb.collection('posts').delete(record.id)).resolves.toBe(true)
	})

	it('rejects writes from anonymous visitors and from users who are not editors', async () => {
		const { pb: user } = await asNewUser()
		for (const pb of [anonymous(), user]) {
			// A valid record, so the 400 can only come from the create rule.
			await expect(
				pb.collection('posts').create({ slug: `${tag}-${uniqueId()}`, title: 'Spam' }),
			).rejects.toMatchObject({ status: 400 })
			await expect(pb.collection('posts').update(ids.past, { title: 'Defaced' })).rejects.toMatchObject({ status: 404 })
			await expect(pb.collection('posts').delete(ids.past)).rejects.toMatchObject({ status: 404 })
		}

		const admin = await asSuperuser()
		expect(await visibleTitles(admin)).toEqual(['draft', 'future', 'past', 'undated'])
	})
})
