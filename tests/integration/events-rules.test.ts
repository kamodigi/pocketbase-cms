import { beforeAll, describe, expect, it } from 'vitest'

import { anonymous, asEditor, asNewUser, asSuperuser, uniqueId } from './clients'

// The rules of examples/lantern-coffee/pb_migrations/1790000500_create_events.js, the multilingual
// article type.
describe('events', () => {
	const tag = uniqueId()

	beforeAll(async () => {
		const admin = await asSuperuser()
		await admin.collection('events').create({ draft: true, slug: `${tag}-draft`, title_en: 'draft' })
		await admin.collection('events').create({ draft: false, slug: `${tag}-published`, title_en: 'published' })
	})

	const visibleTitles = async (pb: ReturnType<typeof anonymous>) => {
		const records = await pb.collection('events').getFullList({ filter: pb.filter('slug ~ {:tag}', { tag }) })
		return records.map(record => record.title_en).toSorted((a, b) => a.localeCompare(b))
	}

	it('shows only published events to anyone but editors', async () => {
		const { pb: user } = await asNewUser()
		expect(await visibleTitles(anonymous())).toEqual(['published'])
		expect(await visibleTitles(user)).toEqual(['published'])
		expect(await visibleTitles(await asEditor())).toEqual(['draft', 'published'])
	})

	it('requires the base locale only, and keeps each locale in its own field', async () => {
		const pb = await asEditor()
		await expect(pb.collection('events').create({ slug: uniqueId(), title_ja: 'タイトル' })).rejects.toMatchObject({
			response: { data: { title_en: { code: 'validation_required' } } },
			status: 400,
		})

		const record = await pb
			.collection('events')
			.create({ draft: true, slug: uniqueId(), title_en: 'Cupping night', title_zh_hans: '杯测之夜' })
		expect(record).toMatchObject({ title_en: 'Cupping night', title_ja: '', title_zh_hans: '杯测之夜' })
		await expect(pb.collection('events').update(record.id, { title_ja: 'カッピングの夜' })).resolves.toMatchObject({
			title_ja: 'カッピングの夜',
		})
		await expect(pb.collection('events').delete(record.id)).resolves.toBe(true)
	})

	it('rejects writes from users who are not editors', async () => {
		const { pb: user } = await asNewUser()
		for (const pb of [anonymous(), user]) {
			await expect(
				pb.collection('events').create({ slug: `${tag}-${uniqueId()}`, title_en: 'Spam' }),
			).rejects.toMatchObject({ status: 400 })
		}
	})
})
