import { describe, expect, it } from 'vitest'

import { linkTarget } from './links'

describe('linkTarget', () => {
	it('keeps the URLs the sanitizer keeps', () => {
		expect(linkTarget(' https://example.com/menu ')).toBe('https://example.com/menu')
		expect(linkTarget('https://example.com')).toBe('https://example.com')
		expect(linkTarget('mailto:hello@example.com')).toBe('mailto:hello@example.com')
		expect(linkTarget('tel:+10000000000')).toBe('tel:+10000000000')
		expect(linkTarget('/about')).toBe('/about')
		expect(linkTarget('#hours')).toBe('#hours')
	})

	it('reads a bare domain as https', () => {
		expect(linkTarget('example.com/menu')).toBe('https://example.com/menu')
	})

	it('refuses other schemes, protocol-relative URLs and text', () => {
		expect(linkTarget('javascript:alert(1)')).toBeUndefined()
		expect(linkTarget('data:text/html,x')).toBeUndefined()
		expect(linkTarget('//example.com')).toBeUndefined()
		expect(linkTarget('https://')).toBeUndefined()
		expect(linkTarget('our menu')).toBeUndefined()
		expect(linkTarget('')).toBeUndefined()
	})
})
