import { describe, expect, it } from 'vitest'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import { buildFormModel, inputKind } from './model'

const posts: SchemaCollection = {
	fields: [
		{ name: 'id', primaryKey: true, type: 'text' },
		{ name: 'title', required: true, type: 'text' },
		{ name: 'slug', type: 'text' },
		{ name: 'body', type: 'editor' },
		{ name: 'cover', type: 'relation' },
		{ maxSelect: 1, name: 'category', type: 'select', values: ['news', 'event'] },
		{ maxSelect: 3, name: 'tags', type: 'select', values: ['a', 'b'] },
		{ name: 'draft', type: 'bool' },
		{ name: 'published_at', type: 'date' },
		{ name: 'author', type: 'relation' },
		{ name: 'meta', type: 'json' },
		{ name: 'created', type: 'autodate' },
		{ name: 'updated', type: 'autodate' },
	],
	name: 'posts',
}

function model(collection: CmsConfig['collections'][string] = {}, schema = posts, locales?: string[]) {
	return buildFormModel({ collections: { [schema.name]: collection }, locales, version: 1 }, schema, 'en')
}

const names = (fields: { name: string }[]) => fields.map(field => field.name)

describe('buildFormModel', () => {
	it('puts every field in main in schema order, and the timestamps in the side, without a layout', () => {
		const result = model()

		// No id, and no json: the CMS has no input for it (decision 10).
		expect(names(result.main)).toEqual([
			'title',
			'slug',
			'body',
			'cover',
			'category',
			'tags',
			'draft',
			'published_at',
			'author',
		])
		expect(names(result.side)).toEqual(['created', 'updated'])
		expect(result.side.map(field => [field.label, field.readonly])).toEqual([
			['Created', true],
			['Updated', true],
		])
		expect(result.titleField).toBe('title')
	})

	it('follows form.main and form.side, and adds what they leave out to the end of main', () => {
		const result = model({
			fields: { author: { autofill: 'currentUser' }, cover: { hidden: true } },
			form: { main: ['title', 'body'], side: ['slug', 'draft', 'updated'] },
		})

		expect(names(result.main)).toEqual(['title', 'body', 'category', 'tags', 'published_at'])
		expect(names(result.side)).toEqual(['slug', 'draft', 'updated', 'created'])
		expect(result.autofill).toEqual([{ kind: 'currentUser', name: 'author' }])
	})

	it('takes labels, help, choices and slugs from the config', () => {
		const result = model({
			fields: {
				category: { label: { en: 'Category', ja: 'カテゴリ' }, options: { news: 'News' } },
				slug: { help: 'Part of the URL.', slugFrom: 'title' },
				title: { readonly: true },
			},
		})
		const field = (name: string) => [...result.main, ...result.side].find(item => item.name === name)!

		expect(field('category')).toMatchObject({ kind: 'select', label: 'Category' })
		expect(field('category').options).toEqual([
			{ label: 'News', value: 'news' },
			{ label: 'event', value: 'event' },
		])
		expect(field('slug')).toMatchObject({ help: 'Part of the URL.', kind: 'slug', slugFrom: 'title' })
		expect(field('title').readonly).toBe(true)
		expect(field('tags').kind).toBe('checkboxes')
	})

	it('shows one input per locale for a localized field', () => {
		const schema: SchemaCollection = {
			fields: [
				{ name: 'title_ja', type: 'text' },
				{ name: 'title_en', type: 'text' },
				{ name: 'slug', type: 'text' },
			],
			name: 'pages',
		}
		const result = model(
			{
				fields: { slug: { slugFrom: 'title' }, title: { label: 'Title', localized: true } },
				form: { main: ['title'] },
			},
			schema,
			['ja', 'en'],
		)

		expect(result.main.map(field => [field.name, field.label])).toEqual([
			['title_ja', 'Title (ja)'],
			['title_en', 'Title (en)'],
			['slug', 'slug'],
		])
		// The slug comes from the base locale.
		expect(result.main[2].slugFrom).toBe('title_ja')
		expect(result.titleField).toBe('title_ja')
	})
})

describe('inputKind', () => {
	it('uses a widget only where it fits the PocketBase type', () => {
		expect(inputKind({ name: 'a', type: 'text' }, { widget: 'textarea' })).toBe('textarea')
		expect(inputKind({ name: 'a', type: 'text' }, { widget: 'number' })).toBe('text')
		expect(inputKind({ name: 'a', type: 'date' }, { widget: 'date' })).toBe('date')
		expect(inputKind({ name: 'a', type: 'date' }, undefined)).toBe('datetime')
		expect(inputKind({ name: 'a', type: 'bool' }, undefined)).toBe('toggle')
		expect(inputKind({ maxSelect: 2, name: 'a', type: 'select' }, { widget: 'select' })).toBe('checkboxes')
		expect(inputKind({ name: 'a', type: 'file' }, undefined)).toBe('file')
		expect(inputKind({ maxSelect: 4, name: 'a', type: 'file' }, { widget: 'file' })).toBe('files')
		expect(inputKind({ name: 'a', type: 'geoPoint' }, undefined)).toBe('pending')
		expect(inputKind({ maxSelect: 1, name: 'a', type: 'relation' }, { widget: 'media' })).toBe('relation')
		expect(inputKind({ maxSelect: 3, name: 'a', type: 'relation' }, undefined)).toBe('relations')
	})
})
