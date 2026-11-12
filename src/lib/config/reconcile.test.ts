import { describe, expect, it } from 'vitest'

import type { CmsConfig } from './types'

import blog from './fixtures/blog.json'
import multilingual from './fixtures/multilingual.json'
import { reconcileConfig, type SchemaCollection } from './reconcile'
import { validateConfig } from './validate'

function collection(name: string, ...fields: string[]): SchemaCollection {
	return { fields: ['id', ...fields].map(f => ({ name: f, type: 'text' })), name }
}

function valid(value: unknown): CmsConfig {
	const result = validateConfig(value)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.config
}

const blogSchema = [
	collection('news', 'title', 'content', 'thumbnail', 'published_at', 'draft', 'pinned', 'legacy_id'),
	collection('works', 'title', 'body', 'link', 'category', 'published_at', 'draft'),
	collection('media', 'file', 'alt', 'caption', 'width', 'height', 'mime', 'uploaded_by', 'created'),
]

const multilingualSchema = [
	collection('about', 'heading_ja', 'heading_en', 'heading_zh_hans', 'body_ja', 'body_en', 'body_zh_hans'),
	collection(
		'events',
		'title_ja',
		'title_en',
		'title_zh_hans',
		'summary_ja',
		'summary_en',
		'summary_zh_hans',
		'slug',
		'starts_at',
		'author',
		'published',
		'created_at',
		'updated',
	),
]

describe('reconcileConfig', () => {
	it('keeps a config that matches the schema as it is', () => {
		const config = valid(blog)
		expect(reconcileConfig(config, blogSchema)).toEqual({ config, warnings: [] })

		const localized = valid(multilingual)
		expect(reconcileConfig(localized, multilingualSchema)).toEqual({ config: localized, warnings: [] })
	})

	it('does not modify the config it was given', () => {
		const config = valid(blog)
		const before = structuredClone(config)
		reconcileConfig(config, [])
		expect(config).toEqual(before)
	})

	it('drops collections the schema does not have, with their nav items and the media library', () => {
		const { config, warnings } = reconcileConfig(valid(blog), blogSchema.slice(0, 1))
		expect(Object.keys(config.collections)).toEqual(['news'])
		expect(config.nav).toEqual([{ items: ['news'], label: { en: 'Content', ja: 'コンテンツ' } }])
		expect(config.media).toBeUndefined()
		expect(warnings).toEqual([
			{ message: 'the PocketBase schema has no collection "works"; ignored', path: '/collections/works' },
			{ message: 'the PocketBase schema has no collection "media"; ignored', path: '/collections/media' },
			{ message: '"media" is not available; media library disabled', path: '/media/collection' },
		])
	})

	it('drops nav groups that end up empty', () => {
		const { config } = reconcileConfig(valid(multilingual), multilingualSchema.slice(1))
		expect(config.nav).toEqual([{ items: ['events'] }])
	})

	it('drops every reference to a missing field', () => {
		const schema = [collection('news', 'content', 'thumbnail', 'draft', 'pinned', 'legacy_id'), ...blogSchema.slice(1)]
		const { config, warnings } = reconcileConfig(valid(blog), schema)
		const news = config.collections.news
		expect(news?.fields?.title).toBeUndefined()
		expect(news?.fields?.published_at).toBeUndefined()
		expect(news?.titleField).toBeUndefined()
		expect(news?.status).toEqual({ draftField: 'draft' })
		expect(news?.list).toEqual({ columns: ['$status'], perPage: 20 })
		expect(news?.form).toEqual({ main: ['content'], side: ['draft', 'pinned', 'thumbnail'] })
		expect(warnings.map(w => w.path)).toEqual([
			'/collections/news/fields/title',
			'/collections/news/fields/published_at',
			'/collections/news/titleField',
			'/collections/news/status/publishedAtField',
			'/collections/news/list/columns/0',
			'/collections/news/list/columns/2',
			'/collections/news/list/sort',
			'/collections/news/form/main/0',
			'/collections/news/form/side/0',
		])
		expect(warnings[0]?.message).toBe('the PocketBase collection "news" has no field "title"; ignored')
		expect(warnings[6]?.message).toBe('the PocketBase collection "news" has no "published_at"; sort ignored')
	})

	it('drops the status and its column when the flag field is missing', () => {
		const schema = [collection('news', 'title', 'content', 'published_at'), ...blogSchema.slice(1)]
		const news = reconcileConfig(valid(blog), schema).config.collections.news
		expect(news?.status).toBeUndefined()
		expect(news?.list?.columns).toEqual(['title', 'published_at'])
	})

	it('explains why the status column was dropped', () => {
		const schema = [collection('news', 'title', 'content', 'published_at'), ...blogSchema.slice(1)]
		const { warnings } = reconcileConfig(valid(blog), schema)
		expect(warnings).toContainEqual({
			message: '"$status" needs "status", which was removed; ignored',
			path: '/collections/news/list/columns/1',
		})
	})

	it('sorts a localized field by its base locale and keeps relation paths and special terms', () => {
		const config = valid({
			collections: { posts: { fields: { title: { localized: true } }, list: { sort: '-title,author.name,@random' } } },
			locales: ['zh-Hans', 'en'],
			version: 1,
		})
		const schema = [collection('posts', 'title_zh_hans', 'title_en', 'author')]
		const { config: result, warnings } = reconcileConfig(config, schema)
		expect(result.collections.posts?.list?.sort).toBe('-title_zh_hans,author.name,@random')
		expect(warnings).toEqual([])
	})

	it('drops a sort whose relation field is missing', () => {
		const config = valid({ collections: { posts: { list: { sort: 'author.name' } } }, version: 1 })
		const { config: result, warnings } = reconcileConfig(config, [collection('posts', 'title')])
		expect(result.collections.posts?.list).toEqual({})
		expect(warnings).toEqual([
			{
				message: 'the PocketBase collection "posts" has no "author.name"; sort ignored',
				path: '/collections/posts/list/sort',
			},
		])
	})

	it('falls back to the defaults when no list column or search field is left', () => {
		const config = valid({ collections: { posts: { list: { columns: ['a'], search: ['b'] } } }, version: 1 })
		const { config: result } = reconcileConfig(config, [collection('posts', 'title')])
		expect(result.collections.posts?.list).toEqual({})
	})

	it('warns about locales a localized field lacks, and drops it when it has none', () => {
		const schema = [
			collection('about', 'heading_ja', 'heading_en', 'body'),
			collection(
				'events',
				'title_ja',
				'title_en',
				'title_zh_hans',
				'slug',
				'starts_at',
				'published',
				'author',
				'created_at',
				'updated',
			),
		]
		const { config, warnings } = reconcileConfig(valid(multilingual), schema)
		expect(config.collections.about?.fields).toEqual({ heading: { label: 'Heading', localized: true } })
		expect(config.collections.events?.form?.main).toEqual(['title'])
		expect(config.collections.events?.fields?.slug).toEqual({ slugFrom: 'title', widget: 'slug' })
		expect(warnings).toEqual([
			{
				message: 'the PocketBase collection "about" has no "heading_zh_hans"',
				path: '/collections/about/fields/heading',
			},
			{
				message: 'the PocketBase collection "about" has none of "body_ja", "body_en", "body_zh_hans"; ignored',
				path: '/collections/about/fields/body',
			},
			{
				message:
					'the PocketBase collection "events" has none of "summary_ja", "summary_en", "summary_zh_hans"; ignored',
				path: '/collections/events/fields/summary',
			},
			{
				message: 'the PocketBase collection "events" has no field "summary"; ignored',
				path: '/collections/events/form/main/1',
			},
		])
	})

	it('drops a slugFrom that names a missing field', () => {
		const config = valid({ collections: { posts: { fields: { slug: { slugFrom: 'name' } } } }, version: 1 })
		const { config: result, warnings } = reconcileConfig(config, [collection('posts', 'slug')])
		expect(result.collections.posts?.fields?.slug).toEqual({})
		expect(warnings.map(w => w.path)).toEqual(['/collections/posts/fields/slug/slugFrom'])
	})

	it('drops missing media fields, and the media library without its file field', () => {
		const withoutCaption = [...blogSchema.slice(0, 2), collection('media', 'file', 'alt', 'width', 'height', 'mime')]
		const partial = reconcileConfig(valid(blog), withoutCaption)
		expect(partial.config.media?.captionField).toBeUndefined()
		expect(partial.warnings.map(w => w.path)).toContain('/media/captionField')

		const withoutFile = [...blogSchema.slice(0, 2), collection('media', 'alt', 'caption', 'created')]
		const disabled = reconcileConfig(valid(blog), withoutFile)
		expect(disabled.config.media).toBeUndefined()
		expect(disabled.warnings).toContainEqual({
			message: 'the PocketBase collection "media" has no field "file"; media library disabled',
			path: '/media/fileField',
		})
	})
})
