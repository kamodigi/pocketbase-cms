// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { relativeUrls } from '../tools/relative-adapter'

describe('relativeUrls', () => {
	it('makes the preload links, stylesheets and imports relative to index.html', () => {
		const html = `<link href="/_app/a.js" rel="modulepreload"><link href="/_app/a.css" rel="stylesheet">
<script>import("/_app/start.js")</script>`

		expect(relativeUrls(html, '_app'))
			.toBe(`<link href="./_app/a.js" rel="modulepreload"><link href="./_app/a.css" rel="stylesheet">
<script>import("./_app/start.js")</script>`)
	})

	it('refuses a page with nothing to make relative', () => {
		expect(() => relativeUrls('<link href="/cms/_app/a.js">', '_app')).toThrow('relative-adapter')
	})
})
