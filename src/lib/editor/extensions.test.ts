import { Editor } from '@tiptap/core'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

import type { RelationTarget } from '#lib/relation/target.js'

import { editorFeatures } from '#lib/config/index.js'

import { editorExtensions, headingId } from './extensions'
import { editorSettings } from './settings'

// The sanitizer PocketBase runs on save; the Go port gives the same output (pbcms/html_test.go).
const { sanitizeHtml } = createRequire(import.meta.url)('../../../hooks/pb_hooks/pbcms/html.cjs') as {
	sanitizeHtml(html: string): string
}

const images = { collection: 'media' } as RelationTarget
const opened: Editor[] = []

/**
The elements of `html` in order, each with the names of its attributes.
*/
function shape(html: string): string[] {
	const { body } = new DOMParser().parseFromString(html, 'text/html')
	return [...body.querySelectorAll('*')].map(
		element =>
			`${element.localName}[${[...element.attributes]
				.map(attribute => attribute.name)
				.toSorted((a, b) => a.localeCompare(b))
				.join(',')}]`,
	)
}

afterEach(() => {
	for (const editor of opened.splice(0)) editor.destroy()
})

function open(content: string, settings = editorSettings(undefined, undefined, images)): Editor {
	const editor = new Editor({ content, element: document.createElement('div'), extensions: editorExtensions(settings) })
	opened.push(editor)
	return editor
}

describe('editorExtensions', () => {
	it('writes only what the sanitizer keeps', () => {
		const input = [
			'<h2>Opening hours</h2>',
			'<p style="text-align: center">We open at <strong>8</strong>, <em>daily</em>, <u>even</u> <s>not</s> on <code>holidays</code>.</p>',
			'<p><a href="https://example.com/menu">Menu</a> and <span style="color: #0a7f99">color</span><br>next line</p>',
			'<ul><li><p>Beans</p></li></ul><ol><li><p>Grind</p></li></ol>',
			'<blockquote><p>Quote</p></blockquote>',
			'<pre><code class="language-js">let a = 1 &lt; 2</code></pre>',
			'<hr>',
			'<figure><a href="https://example.com/"><img src="https://cms.example.com/api/files/media/abc/a.webp" alt="Cup" width="1920" height="1280" data-media-id="abc"></a><figcaption>A cup</figcaption></figure>',
			'<figure><img src="https://cms.example.com/b.webp" alt="" width="10" height="20"></figure>',
			'<p>Inline <img src="https://cms.example.com/c.webp" alt="c" width="4" height="3" data-media-id="c"></p>',
			'<table><tbody><tr><th colspan="1" rowspan="1"><p>Day</p></th></tr><tr><td colspan="1" rowspan="1"><p>Mon</p></td></tr></tbody></table>',
		].join('')

		const html = open(input).getHTML()

		// The sanitizer keeps every element and attribute; it only writes styles more tidily.
		const stored = sanitizeHtml(html)
		expect(shape(stored)).toEqual(shape(html))
		expect(shape(html)).toContain('img[alt,data-media-id,height,src,width]')
		// Opening what was stored gives the same content back.
		expect(open(stored).getHTML()).toBe(html)
		expect(html).toContain('<h2 id="')
		expect(html).toContain('<p style="text-align: center;">')
		expect(html).toContain('<a href="https://example.com/menu">Menu</a>')
		expect(html).toContain('<span style="color: rgb(10, 127, 153);">color</span>')
		expect(html).toContain(
			'<figure><a href="https://example.com/"><img alt="Cup" src="https://cms.example.com/api/files/media/abc/a.webp" width="1920" height="1280" data-media-id="abc"></a><figcaption>A cup</figcaption></figure>',
		)
		expect(html).toContain('<figure><img alt="" src="https://cms.example.com/b.webp" width="10" height="20"></figure>')
		expect(html).toContain('<img alt="c" src="https://cms.example.com/c.webp" width="4" height="3" data-media-id="c">')
		expect(html).toContain('<table><tbody><tr><th><p>Day</p></th></tr>')
	})

	it('drops the markup of features that are off', () => {
		const settings = editorSettings({ features: ['bold', 'heading'], headingLevels: [2] }, undefined, images)

		const html = open(
			'<h3>Sub</h3><p><strong>B</strong> <em>I</em> <a href="/x">L</a></p><ul><li>One</li></ul>',
			settings,
		).getHTML()

		expect(html).toBe('<p>Sub</p><p><strong>B</strong> I L</p><p>One</p>')
	})

	it('gives every feature a working editor', () => {
		for (const feature of editorFeatures) {
			const settings = editorSettings({ features: [feature] }, undefined, images)
			expect(open('<p>Text</p>', settings).getHTML()).toBe('<p>Text</p>')
		}
	})
})

describe('headingId', () => {
	it('is the same for the same text, and starts with a letter', () => {
		expect(headingId('営業時間')).toBe(headingId('営業時間'))
		expect(headingId('営業時間')).not.toBe(headingId('Opening hours'))
		expect(headingId('Opening hours')).toMatch(/^h[\da-f]{7}$/)
	})
})
