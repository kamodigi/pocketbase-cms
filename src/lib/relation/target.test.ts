import type { RecordModel } from 'pocketbase'

import { describe, expect, it } from 'vitest'

import type { CmsConfig, SchemaCollection, SchemaField } from '#lib/config/index.js'

import { nameKeys, recordName } from './name'
import { mediaTarget, relationTarget } from './target'

const stores: SchemaCollection = {
	fields: [
		{ name: 'id', primaryKey: true, type: 'text' },
		{ name: 'name', type: 'text' },
		{ name: 'address', type: 'text' },
		{ name: 'code', type: 'text' },
	],
	id: 'col_stores',
	name: 'stores',
}
const field: SchemaField = { collectionId: 'col_stores', name: 'store', type: 'relation' }

describe('relationTarget', () => {
	it('searches the shown field and what the list of the collection searches, in its order', () => {
		const config: CmsConfig = {
			collections: { stores: { list: { search: ['address'], sort: 'name' }, titleField: 'name' } },
			version: 1,
		}

		expect(relationTarget(config, field, { displayField: 'code' }, [stores], 'en')).toEqual({
			baseLocale: undefined,
			collection: 'stores',
			defaultSort: 'name',
			nameKeys: ['code', 'name', 'title', 'email'],
			searchFields: ['code', 'address'],
		})
	})

	it('gives a media field the media library, and only that field', () => {
		const media: SchemaCollection = {
			fields: [
				{ name: 'file', type: 'file' },
				{ name: 'alt', type: 'text' },
			],
			id: 'col_media',
			name: 'media',
		}
		const config: CmsConfig = {
			collections: { media: { titleField: 'alt' } },
			media: { altField: 'alt', collection: 'media', fileField: 'file' },
			version: 1,
		}
		const cover: SchemaField = { collectionId: 'col_media', name: 'cover', type: 'relation' }

		expect(relationTarget(config, cover, { widget: 'media' }, [media], 'en').media).toMatchObject({
			altField: 'alt',
			collection: 'media',
			fields: { file: 'file' },
		})
		expect(relationTarget(config, cover, undefined, [media], 'en').media).toBeUndefined()
		expect(relationTarget(config, field, { widget: 'media' }, [stores, media], 'en').media).toBeUndefined()
	})

	it('falls back to the first text field', () => {
		const target = relationTarget({ collections: {}, version: 1 }, field, undefined, [stores], 'en')

		expect(target.searchFields).toEqual(['name'])
	})

	it('uses the base locale field of a localized title', () => {
		const events: SchemaCollection = {
			fields: [
				{ name: 'title_ja', type: 'text' },
				{ name: 'title_en', type: 'text' },
			],
			id: 'col_events',
			name: 'events',
		}
		const config: CmsConfig = {
			collections: { events: { fields: { title: { localized: true } }, titleField: 'title' } },
			locales: ['ja', 'en'],
			version: 1,
		}

		const target = relationTarget(config, { ...field, collectionId: 'col_events' }, undefined, [events], 'en')

		expect(target.searchFields).toEqual(['title_ja'])
		const record = { id: 'e1', title_ja: '焙煎会' } as unknown as RecordModel
		expect(recordName(record, target.nameKeys, target.baseLocale)).toBe('焙煎会')
	})

	it('names a collection outside the CMS by its id, with its fields unknown', () => {
		const target = relationTarget(
			{ collections: {}, version: 1 },
			{ ...field, collectionId: '_pb_users_auth_' },
			undefined,
			[stores],
			'en',
		)

		expect(target).toMatchObject({ collection: '_pb_users_auth_', defaultSort: '' })
		expect(target.searchFields).toBeUndefined()
	})
})

describe('mediaTarget', () => {
	it('is the media library as a target, or undefined without one', () => {
		const media: SchemaCollection = {
			fields: [
				{ name: 'file', type: 'file' },
				{ name: 'alt', type: 'text' },
			],
			id: 'col_media',
			name: 'media',
		}
		const config: CmsConfig = {
			collections: { media: { list: { search: ['alt'], sort: '-created' }, titleField: 'alt' } },
			media: { altField: 'alt', collection: 'media', fileField: 'file' },
			version: 1,
		}

		expect(mediaTarget(config, [media], 'en')).toMatchObject({
			collection: 'media',
			defaultSort: '-created',
			media: { altField: 'alt', collection: 'media' },
			searchFields: ['alt'],
		})
		expect(mediaTarget({ ...config, media: undefined }, [media], 'en')).toBeUndefined()
		expect(mediaTarget(config, [], 'en')).toBeUndefined()
	})
})

describe('recordName', () => {
	const keys = nameKeys({ collections: {}, version: 1 }, undefined, 'nickname')

	it('takes the first field with a value, and the id without one', () => {
		expect(recordName({ id: 'u1', name: 'Mika', nickname: '' } as unknown as RecordModel, keys, undefined)).toBe('Mika')
		expect(recordName({ id: 'u2', nickname: 7 } as unknown as RecordModel, keys, undefined)).toBe('7')
		expect(recordName({ id: 'u3' } as unknown as RecordModel, keys, undefined)).toBe('u3')
	})
})
