// The requests the relation picker sends, checked against a real PocketBase.
import { beforeAll, describe, expect, it } from 'vitest'

import type { RelationTarget } from '../../src/lib/relation/target'

import { fetchChosen, searchRecords } from '../../src/lib/relation/records'
import { asEditor, uniqueId } from './clients'

const tag = uniqueId()
const stores: RelationTarget = {
	collection: 'stores',
	defaultSort: 'name',
	nameKeys: ['name'],
	searchFields: ['name', 'address'],
}
const editor = asEditor()
const ids: string[] = []

beforeAll(async () => {
	const pb = await editor
	for (const [name, address] of [
		['b', '2 Dock Street'],
		['a', `${tag} Quay`],
	]) {
		const record = await pb.collection('stores').create({ address, name: `${tag} ${name}`, region: 'south' })
		ids.push(record.id)
	}
})

describe('the records of a relation', () => {
	it('are searched in every search field, in the target order', async () => {
		const found = await searchRecords(await editor, stores, { page: 1, search: tag })

		expect(found.items.map(item => item.name)).toEqual([`${tag} a`, `${tag} b`])
		expect(found.totalItems).toBe(2)
	})

	it('are fetched by id, leaving out one that is gone', async () => {
		const found = await fetchChosen(await editor, stores, [...ids, 'missing00000000'])

		expect(found.map(item => item.id).toSorted((a, b) => a.localeCompare(b))).toEqual(
			ids.toSorted((a, b) => a.localeCompare(b)),
		)
	})

	it('take several posts relations in the order they were chosen', async () => {
		const pb = await editor
		const chosen = [ids[1]!, ids[0]!]
		const post = await pb.collection('posts').create({ slug: tag, stores: chosen, title: tag })

		expect(post.stores).toEqual(chosen)
	})

	// An account is outside the CMS config, so its fields are learned from a record.
	it('can come from a collection outside the CMS, as far as its rules show them', async () => {
		const pb = await editor
		const self = pb.authStore.record!
		const users: RelationTarget = { collection: self.collectionId, defaultSort: '', nameKeys: ['name', 'email'] }

		const found = await searchRecords(pb, users, { page: 1, search: 'editor' })
		const none = await searchRecords(pb, users, { page: 1, search: tag })

		expect(found.items.map(item => item.id)).toEqual([self.id])
		expect(none.items).toEqual([])
	})
})
