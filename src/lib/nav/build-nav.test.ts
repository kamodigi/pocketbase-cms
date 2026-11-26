import { describe, expect, it } from 'vitest'

import type { CmsConfig } from '#lib/config/index.js'

import { buildNav, firstCollection } from './build-nav'
import { collectionIcons, defaultCollectionIcon } from './icons'

const href = (collection: string) => `#/collections/${collection}`

function config(overrides: Partial<CmsConfig> = {}): CmsConfig {
	return {
		collections: {
			about: { icon: 'info', label: { en: 'About', ja: '概要' } },
			media: { icon: 'image' },
			posts: { icon: 'newspaper', label: 'Posts' },
		},
		version: 1,
		...overrides,
	}
}

const labels = (group: ReturnType<typeof buildNav>[number]) => group.items.map(item => item.label)
const shape = (groups: ReturnType<typeof buildNav>) =>
	groups.map(group => ({ items: labels(group), label: group.label }))

describe('buildNav', () => {
	it('puts every collection in one unlabeled group, in config order, without nav', () => {
		const nav = buildNav(config(), { href, uiLocale: 'en' })
		expect(shape(nav)).toEqual([{ items: ['About', 'media', 'Posts'], label: undefined }])
	})

	it('follows the nav groups and appends unlisted collections to the last group', () => {
		const nav = buildNav(
			config({
				nav: [
					{ items: ['posts'], label: { en: 'Content', ja: 'コンテンツ' } },
					{ items: ['about'], label: 'Pages' },
				],
			}),
			{ href, uiLocale: 'ja' },
		)
		expect(shape(nav)).toEqual([
			{ items: ['Posts'], label: 'コンテンツ' },
			{ items: ['概要', 'media'], label: 'Pages' },
		])
	})

	it('lists a collection once, skips names the config lacks and drops empty groups', () => {
		const nav = buildNav(
			config({
				nav: [
					{ items: ['posts', 'posts', 'missing'], label: 'A' },
					{ items: ['missing'], label: 'B' },
					{ items: ['posts', 'media'], label: 'C' },
				],
			}),
			{ href, uiLocale: 'en' },
		)
		expect(shape(nav)).toEqual([
			{ items: ['Posts'], label: 'A' },
			{ items: ['media', 'About'], label: 'C' },
		])
	})

	it('links each item and marks the current collection', () => {
		const [group] = buildNav(config(), { current: 'posts', href, uiLocale: 'en' })
		expect(group?.items.map(item => [item.href, item.current])).toEqual([
			['#/collections/about', false],
			['#/collections/media', false],
			['#/collections/posts', true],
		])
	})

	it('uses the Lucide icon the config names, and a default for unknown or missing ones', () => {
		const [group] = buildNav(
			config({ collections: { a: { icon: 'newspaper' }, b: { icon: 'no-such-icon' }, c: {} } }),
			{ href, uiLocale: 'en' },
		)
		expect(group?.items.map(item => item.icon)).toEqual([
			collectionIcons['newspaper'],
			defaultCollectionIcon,
			defaultCollectionIcon,
		])
	})
})

describe('firstCollection', () => {
	it('is the top item of the sidebar', () => {
		expect(firstCollection(config())).toBe('about')
		expect(firstCollection(config({ nav: [{ items: ['media'] }] }))).toBe('media')
	})
})
