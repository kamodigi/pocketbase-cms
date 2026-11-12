import { describe, expect, it } from 'vitest'

import { localizedFieldName, resolveLabel } from './localize'

describe('resolveLabel', () => {
	it('returns a plain string as it is', () => {
		expect(resolveLabel('News', 'ja', 'news')).toBe('News')
	})

	it('picks the UI locale, then its language, then the first entry', () => {
		const label = { en: 'News', ja: 'お知らせ', 'zh-Hant': '最新消息' }
		expect(resolveLabel(label, 'ja', 'news')).toBe('お知らせ')
		expect(resolveLabel(label, 'zh-Hant', 'news')).toBe('最新消息')
		expect(resolveLabel(label, 'en-GB', 'news')).toBe('News')
		expect(resolveLabel(label, 'fr', 'news')).toBe('News')
	})

	it('falls back when there is no label', () => {
		expect(resolveLabel(undefined, 'ja', 'news')).toBe('news')
	})
})

describe('localizedFieldName', () => {
	it('appends the locale in lower case with underscores', () => {
		expect(localizedFieldName('title', 'ja')).toBe('title_ja')
		expect(localizedFieldName('title', 'zh-Hans')).toBe('title_zh_hans')
	})
})
