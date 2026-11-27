import { afterEach, describe, expect, it, vi } from 'vitest'

import { changedValues, draftKey, isSavedSince, readDraft, removeDraft, removeUserDrafts, writeDraft } from './draft'
import { buildFormModel } from './model'
import { initialValues } from './values'

const model = buildFormModel(
	{ collections: { posts: {} }, version: 1 },
	{
		fields: [
			{ name: 'title', type: 'text' },
			{ name: 'rank', type: 'number' },
			{ name: 'pinned', type: 'bool' },
			{ maxSelect: 2, name: 'tags', type: 'select', values: ['a', 'b'] },
			{ name: 'updated', type: 'autodate' },
		],
		name: 'posts',
	},
	'en',
)
const initial = { ...initialValues(model, undefined), rank: 2, title: 'Autumn' }
const key = draftKey('u1', 'posts', 'p1')
const savedAt = '2026-01-02T03:04:00.000Z'

function store(values: unknown) {
	localStorage.setItem(key, JSON.stringify({ ownSlugs: {}, savedAt, values }))
}

afterEach(() => {
	localStorage.clear()
	vi.restoreAllMocks()
})

describe('draftKey', () => {
	it('names the editor and the record, or the new record', () => {
		expect(key).toBe('pbcms:draft:u1:posts/p1')
		expect(draftKey('u1', 'posts', undefined)).toBe('pbcms:draft:u1:posts/new')
	})
})

function recordSavedAt(updated?: string) {
	return { collectionId: 'c', collectionName: 'posts', id: 'p1', updated }
}

describe('isSavedSince', () => {
	const draft = { ownSlugs: {}, recordUpdated: '2026-01-02 03:04:00.000Z', savedAt, values: {} }

	it('tells a record saved again from the one the input was made on', () => {
		expect(isSavedSince(draft, recordSavedAt(draft.recordUpdated))).toBe(false)
		expect(isSavedSince(draft, recordSavedAt('2026-01-03 00:00:00.000Z'))).toBe(true)
	})

	it('does not guess without both timestamps', () => {
		expect(isSavedSince(draft, recordSavedAt())).toBe(false)
		expect(isSavedSince(draft, undefined)).toBe(false)
		expect(isSavedSince({ ...draft, recordUpdated: '' }, recordSavedAt(draft.recordUpdated))).toBe(false)
	})
})

describe('removeUserDrafts', () => {
	it('removes the drafts of that editor and nothing else', () => {
		const kept = [draftKey('u10', 'posts', 'p1'), draftKey('u2', 'posts'), 'pocketbase_auth']
		for (const name of [key, draftKey('u1', 'stores'), ...kept]) localStorage.setItem(name, 'x')

		removeUserDrafts('u1')

		expect(Object.keys(localStorage)).toHaveLength(kept.length)
		expect(Object.keys(localStorage)).toEqual(expect.arrayContaining(kept))
	})
})

describe('changedValues', () => {
	it('holds the editable fields that differ', () => {
		expect(changedValues(model, initial, initial)).toEqual({})
		expect(changedValues(model, { ...initial, tags: ['a'], title: 'Winter', updated: 'x' }, initial)).toEqual({
			tags: ['a'],
			title: 'Winter',
		})
	})
})

describe('readDraft', () => {
	it('gives back what was written, an emptied number included', () => {
		const values = { pinned: true, rank: undefined, tags: ['b'] }
		const draft = { ownSlugs: { slug: true }, recordUpdated: savedAt, savedAt, values }
		writeDraft(key, draft)
		const read = readDraft(key, model, initial)
		expect(read).toStrictEqual(draft)
	})

	it('drops what no longer applies', () => {
		store({ gone: 'x', pinned: 'yes', rank: '3', tags: [1], title: 'Winter', updated: 'x' })
		expect(readDraft(key, model, initial)?.values).toEqual({ title: 'Winter' })
	})

	it('removes a draft the record already holds', () => {
		store({ title: 'Autumn' })
		expect(readDraft(key, model, initial)).toBeUndefined()
		expect(localStorage.getItem(key)).toBeNull()
	})

	it.each([
		'not json',
		'null',
		'{"values":null}',
		'{"values":{"title":"x"}}',
		'{"savedAt":"x","values":{"title":"x"}}',
	])('removes unreadable data: %s', text => {
		localStorage.setItem(key, text)
		expect(readDraft(key, model, initial)).toBeUndefined()
		expect(localStorage.getItem(key)).toBeNull()
	})

	it('finds nothing where nothing was written, or without storage', () => {
		expect(readDraft(key, model, initial)).toBeUndefined()
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked')
		})
		expect(readDraft(key, model, initial)).toBeUndefined()
	})
})

describe('writeDraft', () => {
	it('removes the older draft when the new one does not fit', () => {
		store({ title: 'Winter' })
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('full')
		})
		writeDraft(key, { ownSlugs: {}, recordUpdated: '', savedAt, values: { title: 'Winter blend' } })
		expect(localStorage.getItem(key)).toBeNull()
	})

	it('does not fail without storage', () => {
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new Error('blocked')
		})
		expect(() => removeDraft(key)).not.toThrow()
		localStorage.setItem(key, 'x')
		expect(() => removeUserDrafts('u1')).not.toThrow()
	})
})
