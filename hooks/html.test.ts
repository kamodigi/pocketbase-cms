import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

// The hooks' helpers are CommonJS, because PocketBase loads them with require().
const { fileUrl, findMediaIds, publicBaseUrl, rewriteMediaSrc, sanitizeHtml } = createRequire(import.meta.url)(
	'./pb_hooks/pbcms/html.cjs',
) as {
	fileUrl(baseUrl: string, collectionId: string, recordId: string, filename: string): string
	findMediaIds(html: string): string[]
	publicBaseUrl(envUrl: string, appUrl: string): string
	rewriteMediaSrc(html: string, urls: Record<string, string>): string
	sanitizeHtml(html: string): string
}

function assertInert(markup: string) {
	const body = parse(markup)
	expect(body.querySelector('script, style, iframe, object, embed, svg, math, form, input')).toBeNull()
	for (const element of body.querySelectorAll('*')) {
		for (const attribute of element.attributes) {
			expect(attribute.name).not.toMatch(/^on/i)
			if (attribute.name !== 'href' && attribute.name !== 'src') continue
			// Browsers ignore spaces and control characters when they look for the scheme.
			const compact = [...attribute.value].filter(char => char.codePointAt(0)! > 0x20).join('')
			expect(compact).not.toMatch(/^(?:javascript|vbscript|data):/i)
		}
	}
}

/**
Parses the output the way a browser does, to check what it would actually run.
*/
function parse(markup: string): HTMLElement {
	return new DOMParser().parseFromString(markup, 'text/html').body
}

describe('sanitizeHtml', () => {
	test('keeps the editor’s output as it is', () => {
		const input =
			'<h2>Title</h2><p><strong>bold</strong> and <em>italic</em>, <u>u</u> <s>s</s> <code>c</code> <mark>m</mark>' +
			' H<sub>2</sub>O x<sup>2</sup><br><a href="https://example.com/" target="_blank" rel="noopener noreferrer nofollow">link</a></p>' +
			'<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol><blockquote><p>quote</p></blockquote><pre><code>x &lt; y</code></pre><hr>' +
			'<figure><img src="https://pb.example.com/api/files/c/r/a.webp" alt="A cup" width="1200" height="800" data-media-id="abc123"><figcaption>Cap</figcaption></figure>' +
			'<table><tbody><tr><th colspan="2" rowspan="1" scope="col">h</th></tr><tr><td style="min-width: 25px">d</td></tr></tbody></table>' +
			'<p style="text-align: center"><span style="color: #ff0000">red</span> <span class="note" id="intro">x</span></p>'
		expect(sanitizeHtml(input)).toBe(input)
	})

	test('removes script elements with their content', () => {
		expect(sanitizeHtml("<script>alert('xss')</script>")).toBe('')
		expect(sanitizeHtml('<p>Hello <script>x</script>World</p>')).toBe('<p>Hello World</p>')
		expect(sanitizeHtml('<p>a<SCRIPT type="text/javascript">x</script >b</p>')).toBe('<p>ab</p>')
		expect(sanitizeHtml('<p>a<script>never closed')).toBe('<p>a</p>')
	})

	test('removes style, iframe and similar elements with their content', () => {
		expect(sanitizeHtml('<style>body{display:none}</style><p>x</p>')).toBe('<p>x</p>')
		expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>')).toBe('')
		expect(sanitizeHtml('<textarea><img src=x onerror=alert(1)></textarea>')).toBe('')
		expect(sanitizeHtml('<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>')).toBe(
			'<img src="x">"&gt;',
		)
	})

	test('removes other disallowed tags but keeps their text', () => {
		expect(sanitizeHtml('<p><font color="red">red</font></p>')).toBe('<p>red</p>')
		expect(sanitizeHtml('<form action="/x"><input name="a">text</form>')).toBe('text')
		expect(sanitizeHtml('<svg><a href="javascript:alert(1)">x</a></svg>')).toBe('<a>x</a>')
	})

	test('removes event handlers and unknown attributes', () => {
		expect(sanitizeHtml('<a onclick="evil()" href="#">x</a>')).toBe('<a href="#">x</a>')
		expect(sanitizeHtml('<img src="x" alt="img" onerror="evil()">')).toBe('<img src="x" alt="img">')
		expect(sanitizeHtml('<p data-x="1" contenteditable>t</p>')).toBe('<p>t</p>')
		expect(sanitizeHtml('<img/src="x"/onerror=alert(1)>')).toBe('<img src="x">')
	})

	test('drops URLs with unsafe schemes and keeps safe or relative ones', () => {
		expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
		expect(sanitizeHtml('<a href=" JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>')
		expect(sanitizeHtml('<a href="java&#x09;script:alert(1)">x</a>')).toBe('<a>x</a>')
		expect(sanitizeHtml('<a href="java&#9script&colon;alert(1)">x</a>')).toBe('<a>x</a>')
		expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>')
		expect(sanitizeHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">')).toBe('<img>')
		expect(sanitizeHtml('<a href="vbscript:x">x</a>')).toBe('<a>x</a>')
		expect(sanitizeHtml('<a href="mailto:a@example.com">m</a><a href="tel:+81">t</a>')).toBe(
			'<a href="mailto:a@example.com">m</a><a href="tel:+81">t</a>',
		)
		expect(sanitizeHtml('<a href="/news/1?a=1&amp;b=2#top">x</a><img src="photo.jpg">')).toBe(
			'<a href="/news/1?a=1&amp;b=2#top">x</a><img src="photo.jpg">',
		)
		// An unknown named reference is not decoded, so it stays harmless text in the URL.
		expect(sanitizeHtml('<a href="javascript&amp;colon;x">x</a>')).toBe('<a href="javascript&amp;colon;x">x</a>')
	})

	test('keeps only allowed styles', () => {
		expect(sanitizeHtml('<p style="text-align: right; position: fixed; top: 0">x</p>')).toBe(
			'<p style="text-align: right">x</p>',
		)
		// Spaces are normalized: none around "(", ")", "," and "/".
		expect(sanitizeHtml('<span style="color: rgb( 1, 2 ,3 ); background-color: rgba(0 0  0 / 50%)">x</span>')).toBe(
			'<span style="color: rgb(1,2,3); background-color: rgba(0 0 0/50%)">x</span>',
		)
		expect(sanitizeHtml('<span style="color: hsl(120deg 50% 25%)">x</span>')).toBe(
			'<span style="color: hsl(120deg 50% 25%)">x</span>',
		)
		expect(sanitizeHtml('<span style="background-color: url(https://evil.example/t.png)">x</span>')).toBe(
			'<span>x</span>',
		)
		expect(sanitizeHtml('<span style="color: expression(alert(1))">x</span>')).toBe('<span>x</span>')
	})

	test('caps the length of numbers and styles', () => {
		expect(sanitizeHtml('<td colspan="12345" width="1234567" style="min-width: 1234567px">x</td>')).toBe('<td>x</td>')
		expect(sanitizeHtml(`<p style="color: ${'a'.repeat(31)}">x</p>`)).toBe('<p>x</p>')
		expect(sanitizeHtml(`<p style="text-align: center;${' '.repeat(1000)}">x</p>`)).toBe('<p>x</p>')
	})

	test('checks attribute values', () => {
		expect(sanitizeHtml('<img src="a.png" width="100%" height="auto" data-media-id="a b">')).toBe(
			'<img src="a.png" width="100%">',
		)
		expect(sanitizeHtml('<td colspan="2x" scope="table" class="a&quot;b" id="1x">x</td>')).toBe('<td>x</td>')
	})

	test('keeps only harmless rel values', () => {
		expect(sanitizeHtml('<a href="/" target="_blank" rel="opener noopener NoFollow">x</a>')).toBe(
			'<a href="/" target="_blank" rel="noopener nofollow">x</a>',
		)
		expect(sanitizeHtml('<a href="/" rel="opener">x</a>')).toBe('<a href="/">x</a>')
	})

	test('adds noopener whenever there is a target', () => {
		expect(sanitizeHtml('<a href="/" target="preview">x</a>')).toBe('<a href="/" target="preview" rel="noopener">x</a>')
		expect(sanitizeHtml('<a rel="nofollow" href="/" target="_blank">x</a>')).toBe(
			'<a rel="nofollow noopener" href="/" target="_blank">x</a>',
		)
	})

	test('flattens very deep nesting', () => {
		const output = sanitizeHtml('<div>'.repeat(150) + 'x' + '</div>'.repeat(150))
		expect(output).toBe('<div>'.repeat(100) + 'x' + '</div>'.repeat(100))
	})

	test('takes linear time on hostile input', () => {
		const started = performance.now()
		sanitizeHtml('<xmp></xmp>'.repeat(100_000))
		sanitizeHtml('<div>'.repeat(100_000) + '</span>'.repeat(100_000))
		sanitizeHtml(`<p style="color: rgb(1${' '.repeat(1_000_000)}x">x</p>`)
		sanitizeHtml(`<p style="${'color: rgb(1;'.repeat(50_000)}">x</p>`)
		sanitizeHtml(`<p class="${'a'.repeat(1_000_000)}!" title="${'&a'.repeat(500_000)}">x</p>`)
		expect(performance.now() - started).toBeLessThan(2000)
	})

	test('drops comments, doctypes and processing instructions', () => {
		expect(sanitizeHtml('<!DOCTYPE html><!-- c --><p>x<!-- <script>alert(1)</script> --></p><?xml x?>')).toBe(
			'<p>x</p>',
		)
		expect(sanitizeHtml('<p>x</p><!-- never closed <script>alert(1)</script>')).toBe('<p>x</p>')
	})

	test('escapes stray markup characters and keeps character references', () => {
		expect(sanitizeHtml('a < b > c & d &amp; &hellip; &#169;')).toBe('a &lt; b &gt; c &amp; d &amp; &hellip; &#169;')
		expect(sanitizeHtml('<p>1 <2</p>')).toBe('<p>1 &lt;2</p>')
		expect(sanitizeHtml('<img alt="a &quot;b&quot; <c>">')).toBe('<img alt="a &quot;b&quot; &lt;c&gt;">')
	})

	test('closes open tags and ignores stray end tags', () => {
		expect(sanitizeHtml('<p><strong>x')).toBe('<p><strong>x</strong></p>')
		expect(sanitizeHtml('<p><em>x</p>y</em>')).toBe('<p><em>x</em></p>y')
		expect(sanitizeHtml('</div>x</p>')).toBe('x')
	})

	test('drops a tag that never ends', () => {
		expect(sanitizeHtml('<p>x</p><img src="a" onerror="alert(1)')).toBe('<p>x</p>')
		expect(sanitizeHtml('<p>x</p><a href="x"')).toBe('<p>x</p>')
	})

	test('returns an empty string for empty or non-string input', () => {
		expect(sanitizeHtml('')).toBe('')
		expect(sanitizeHtml(undefined as unknown as string)).toBe('')
	})

	test.each([
		'<img src=x onerror=alert(1)//>',
		'<svg><script>alert(1)</script></svg>',
		'<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
		'<a href="javas\0cript:alert(1)">x</a>',
		'<a href="\u{1}javascript:alert(1)">x</a>',
		'<p title="</p><script>alert(1)</script>">x</p>',
		'<<script>script>alert(1)<</script>/script>',
		'<scr<script>ipt>alert(1)</script>',
		'<img """><script>alert(1)</script>">',
		'<a href=javascript&colon;alert(1)>x</a>',
		'<div style="background:url(javascript:alert(1))">x</div>',
		'<object data="x.swf"></object><embed src="x.swf">',
		'<img src="x" =onerror=alert(1)>',
		'<!--><img src=x onerror=alert(1)>-->',
		'<a href="https://example.com/"x onmouseover=alert(1)>x</a>',
	])('output is inert in a browser: %s', input => {
		assertInert(sanitizeHtml(input))
	})

	test('is idempotent', () => {
		const input = '<p>a &amp; b <a href="/x?a=1&b=2">l</a><img alt="q&quot;" src="x.png"> < > &</p>'
		const once = sanitizeHtml(input)
		expect(sanitizeHtml(once)).toBe(once)
	})
})

describe('findMediaIds', () => {
	test('lists the distinct ids of images with data-media-id', () => {
		expect(
			findMediaIds(
				'<img data-media-id="a1" src="x"><p>data-media-id="no"</p><img src="y"><img data-media-id="b2"><img data-media-id="a1">',
			),
		).toEqual(['a1', 'b2'])
	})

	test('ignores other tags and invalid ids', () => {
		expect(findMediaIds('<span data-media-id="a1"></span><img data-media-id="x y">')).toEqual([])
		expect(findMediaIds('')).toEqual([])
	})
})

describe('rewriteMediaSrc', () => {
	const urls = { a1: 'https://pb.example.com/api/files/col_media/a1/new.webp' }

	test('replaces the src of images with a known data-media-id', () => {
		expect(
			rewriteMediaSrc(
				'<p>x</p><img src="https://old.example/a.webp" alt="A" data-media-id="a1" width="10"><p>y</p>',
				urls,
			),
		).toBe(
			'<p>x</p><img src="https://pb.example.com/api/files/col_media/a1/new.webp" alt="A" data-media-id="a1" width="10"><p>y</p>',
		)
	})

	test('adds a src when there is none', () => {
		expect(rewriteMediaSrc('<img data-media-id="a1">', urls)).toBe(
			'<img src="https://pb.example.com/api/files/col_media/a1/new.webp" data-media-id="a1">',
		)
	})

	test('leaves images without data-media-id, and other tags, as they are', () => {
		const input = "<img src='plain.png' alt=b><p data-media-id='a1'>t</p>"
		expect(rewriteMediaSrc(input, urls)).toBe(input)
		expect(rewriteMediaSrc('', urls)).toBe('')
	})

	test('removes the src of images whose id is not in the map', () => {
		expect(rewriteMediaSrc('<img src="old.png" alt="A" data-media-id="zz">', urls)).toBe(
			'<img alt="A" data-media-id="zz">',
		)
	})

	test('rebuilds only well-formed attribute names', () => {
		expect(rewriteMediaSrc('<img data-media-id="a1" "x=1 data-ok="y">', urls)).toBe(
			'<img src="https://pb.example.com/api/files/col_media/a1/new.webp" data-media-id="a1" data-ok="y">',
		)
	})

	test('escapes the URL', () => {
		expect(rewriteMediaSrc('<img data-media-id="a1">', { a1: 'https://x.example/a"b<c>.png?a=1&b=2' })).toBe(
			'<img src="https://x.example/a&quot;b&lt;c&gt;.png?a=1&amp;b=2" data-media-id="a1">',
		)
	})
})

describe('publicBaseUrl', () => {
	test('prefers PBCMS_PUBLIC_URL', () => {
		expect(publicBaseUrl('https://pb.example.com/', 'http://localhost:8090')).toBe('https://pb.example.com')
	})

	test('then the Application URL setting', () => {
		expect(publicBaseUrl('', 'https://pb.example.com/')).toBe('https://pb.example.com')
		expect(publicBaseUrl(' ', 'https://pb.example.com')).toBe('https://pb.example.com')
	})

	test('gives root-relative URLs when neither is set', () => {
		expect(publicBaseUrl('', '')).toBe('')
	})
})

describe('fileUrl', () => {
	test('builds PocketBase’s file URL', () => {
		expect(fileUrl('https://pb.example.com', 'col_media', 'a1', 'photo a.webp')).toBe(
			'https://pb.example.com/api/files/col_media/a1/photo%20a.webp',
		)
	})
})
