// HTML helpers for the pocketbase-cms hooks: sanitizing `editor` fields on save and pointing
// <img data-media-id> at the media file's current URL on read.
//
// PocketBase runs this file in its own JavaScript engine (goja), which has no DOM, so the HTML is
// tokenized here by hand. The sanitizer never passes input through: it re-serializes the tokens it
// keeps, escaping every text run and attribute value, and closes every tag it opens.
// Load it inside a handler with require(`${__hooks}/pbcms/html.cjs`).

'use strict'

// Based on the allowlist of the rich text editor this CMS grew out of, plus data-media-id.
const ALLOWED_TAGS = new Set([
	'a',
	'blockquote',
	'br',
	'code',
	'div',
	'em',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'img',
	'li',
	'mark',
	'ol',
	'p',
	'pre',
	's',
	'span',
	'strong',
	'sub',
	'sup',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'u',
	'ul',
])

const VOID_TAGS = new Set(['br', 'hr', 'img'])

// Elements whose content is not HTML (or must never be shown); they are dropped with their content.
const RAW_TEXT_TAGS = new Set([
	'iframe',
	'noembed',
	'noframes',
	'noscript',
	'plaintext',
	'script',
	'style',
	'textarea',
	'title',
	'xmp',
])

const INTEGER = /^\d+$/
const SIZE = /^\d+(?:\.\d+)?%?$/

// Attribute name -> check. A check returns the value to keep, or undefined to drop the attribute.
const ALLOWED_ATTRS = {
	alt: value => value,
	class: value => (/^[\w\- ]+$/.test(value) ? value : undefined),
	colspan: value => (INTEGER.test(value) ? value : undefined),
	'data-media-id': value => (isMediaId(value) ? value : undefined),
	height: value => (SIZE.test(value) ? value : undefined),
	href: safeUrl,
	id: value => (/^[A-Za-z][\w-]*$/.test(value) ? value : undefined),
	rel: value => {
		const tokens = value
			.toLowerCase()
			.split(/\s+/)
			.filter(token => REL_TOKENS.has(token))
		return tokens.length === 0 ? undefined : tokens.join(' ')
	},
	rowspan: value => (INTEGER.test(value) ? value : undefined),
	scope: value => (/^(?:col|colgroup|row|rowgroup)$/.test(value) ? value : undefined),
	src: safeUrl,
	style: safeStyle,
	target: value => (/^_?[\w-]+$/.test(value) ? value : undefined),
	width: value => (SIZE.test(value) ? value : undefined),
}

// rel values that never give the linked page a handle on this one.
const REL_TOKENS = new Set(['external', 'nofollow', 'noopener', 'noreferrer', 'sponsored', 'ugc'])

// Deeper nesting is flattened, so closing tags never costs more than this per tag.
const MAX_DEPTH = 100

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])

const COLOR = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\(\s*[\d.%]+(?:deg)?(?:\s*[\s,/]\s*[\d.%]+){2,3}\s*\)|[a-z]+)$/i
const LENGTH = /^\d+(?:\.\d+)?(?:px|%|em|rem)$/

// CSS property -> allowed value. Only what the editor writes: alignment, colors and table widths.
const ALLOWED_STYLES = {
	'background-color': COLOR,
	color: COLOR,
	height: LENGTH,
	'min-width': LENGTH,
	'text-align': /^(?:left|right|center|justify|start|end)$/i,
	width: LENGTH,
}

const NAMED_ENTITIES = {
	amp: '&',
	apos: "'",
	colon: ':',
	gt: '>',
	lt: '<',
	nbsp: '\u{A0}',
	newline: '\n',
	quot: '"',
	tab: '\t',
}

/**
Pops and closes the open tags down to and including `name`, so the output stays well-formed.
*/
function closeUpTo(open, name) {
	let out = ''
	let closed
	do {
		closed = open.pop()
		out += `</${closed}>`
	} while (closed !== name)
	return out
}

/**
Decodes character references in an attribute value. Unknown named references stay as they are;
they are escaped on output, so a browser never decodes them either.
*/
function decodeEntities(value) {
	return value.replaceAll(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));?/gi, (match, decimal, hex, name) => {
		if (decimal !== undefined || hex !== undefined) {
			const code = decimal === undefined ? Number.parseInt(hex, 16) : Number(decimal)
			const isValid = code > 0 && code <= 0x10_ff_ff && (code < 0xd8_00 || code > 0xdf_ff)
			return isValid ? String.fromCodePoint(code) : '\u{FFFD}'
		}
		const decoded = NAMED_ENTITIES[name.toLowerCase()]
		return decoded === undefined || !match.endsWith(';') ? match : decoded
	})
}

function escapeAttribute(value) {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeText(text) {
	// Keep character references the input already has, but escape a bare "&".
	return text
		.replaceAll(/&(?![a-z][\da-z]*;|#\d+;|#x[\da-f]+;)/gi, '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
}

/**
The URL PocketBase serves a record's file at.
*/
function fileUrl(baseUrl, collectionId, recordId, filename) {
	return `${baseUrl}/api/files/${encodeURIComponent(collectionId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}`
}

/**
Returns the distinct data-media-id values of the <img> tags in `html`.
*/
function findMediaIds(html) {
	if (typeof html !== 'string' || !html.includes('data-media-id')) return []
	const ids = new Set()
	for (const token of tokenize(html)) {
		if (token.type !== 'start' || token.name !== 'img') continue
		const id = mediaIdOf(token)
		if (id !== undefined) ids.add(id)
	}
	return [...ids]
}

/**
Finds "</name" followed by whitespace, "/" or ">" at or after `from` in the lowercased HTML.
*/
function findRawTextEnd(lower, name, from) {
	let pos = from
	for (;;) {
		const found = lower.indexOf(`</${name}`, pos)
		if (found === -1) return -1
		const after = lower.charAt(found + name.length + 2)
		if (after === '' || /[\s/>]/.test(after)) return found
		pos = found + 1
	}
}

function isControlOrSpace(code) {
	return code <= 0x20 || (code >= 0x7f && code <= 0x9f)
}

/**
Whether a string looks like a PocketBase record id.
*/
function isMediaId(value) {
	return /^[\w-]{1,100}$/.test(value)
}

function mediaIdOf(token) {
	const attr = token.attrs.find(a => a.name === 'data-media-id')
	return attr && isMediaId(attr.value) ? attr.value : undefined
}

/**
The origin that file URLs start with: PBCMS_PUBLIC_URL if set, else PocketBase's Application URL
setting. Returns '' if neither is set, which gives root-relative URLs. Request headers such as
X-Forwarded-Host are not used, since a client can set them when PocketBase is not behind a proxy.
*/
function publicBaseUrl(envUrl, appUrl) {
	return trimTrailingSlash(envUrl) || trimTrailingSlash(appUrl)
}

/**
Reads a tag name and attributes from `from` up to and including ">".
*/
function readTag(html, from) {
	const length = html.length
	let pos = from
	while (pos < length && !/[\s/>]/.test(html.charAt(pos))) pos++
	const name = html.slice(from, pos).toLowerCase()
	const attrs = []

	while (pos < length) {
		const char = html.charAt(pos)
		if (char === '>') return { attrs, name, to: pos + 1 }
		if (/[\s/]/.test(char)) {
			pos++
			continue
		}
		const attrStart = pos
		pos++ // The first character may be "=", which then belongs to the name.
		while (pos < length && !/[\s/>=]/.test(html.charAt(pos))) pos++
		const attrName = html.slice(attrStart, pos).toLowerCase()
		const nameEnd = pos
		let value = ''
		while (pos < length && /\s/.test(html.charAt(pos))) pos++
		if (html.charAt(pos) === '=') {
			pos++
			while (pos < length && /\s/.test(html.charAt(pos))) pos++
			const quote = html.charAt(pos)
			if (quote === '"' || quote === "'") {
				const close = html.indexOf(quote, pos + 1)
				if (close === -1) return
				value = html.slice(pos + 1, close)
				pos = close + 1
			} else {
				const valueStart = pos
				while (pos < length && !/[\s>]/.test(html.charAt(pos))) pos++
				value = html.slice(valueStart, pos)
			}
		} else {
			// No value: whatever follows the spaces starts the next attribute.
			pos = nameEnd
		}
		attrs.push({ name: attrName, value: decodeEntities(value) })
	}
	return
}

/**
Sets the src of every <img data-media-id> to urls[id]. Images without the attribute, or whose id
is not in `urls`, are left alone, as is everything else in `html`.
*/
function rewriteMediaSrc(html, urls) {
	if (typeof html !== 'string' || !html.includes('data-media-id')) return html
	let out = ''
	let copied = 0
	for (const token of tokenize(html)) {
		if (token.type !== 'start' || token.name !== 'img') continue
		const id = mediaIdOf(token)
		if (id === undefined || !Object.prototype.hasOwnProperty.call(urls, id)) continue
		const attrs = token.attrs.filter(a => a.name !== 'src')
		attrs.unshift({ name: 'src', value: urls[id] })
		out += html.slice(copied, token.from) + serializeStartTag('img', attrs)
		copied = token.to
	}
	return copied === 0 ? html : out + html.slice(copied)
}

/**
Keeps the declarations in ALLOWED_STYLES whose values match; drops the rest.
*/
function safeStyle(value) {
	const kept = []
	for (const declaration of value.split(';')) {
		const colon = declaration.indexOf(':')
		if (colon === -1) continue
		const property = declaration.slice(0, colon).trim().toLowerCase()
		const propertyValue = declaration.slice(colon + 1).trim()
		const pattern = Object.prototype.hasOwnProperty.call(ALLOWED_STYLES, property)
			? ALLOWED_STYLES[property]
			: undefined
		if (pattern && pattern.test(propertyValue)) kept.push(`${property}: ${propertyValue}`)
	}
	return kept.length === 0 ? undefined : kept.join('; ')
}

/**
Keeps relative URLs and http, https, mailto and tel URLs.
*/
function safeUrl(value) {
	// Browsers strip leading and trailing spaces and control characters from URLs.
	let start = 0
	let end = value.length
	while (start < end && value.codePointAt(start) <= 0x20) start++
	while (end > start && value.codePointAt(end - 1) <= 0x20) end--
	const trimmed = value.slice(start, end)
	// They also ignore tabs and newlines inside, so "java\tscript:" is still a scheme. Drop every
	// control character to be safe.
	const compact = [...trimmed].filter(char => !isControlOrSpace(char.codePointAt(0))).join('')
	const scheme = /^([a-z][\d+.a-z-]*):/i.exec(compact)
	return scheme && !ALLOWED_SCHEMES.has(scheme[1].toLowerCase()) ? undefined : trimmed
}

/**
Returns `html` with only the allowed tags, attributes, URL schemes and styles. Script, style and
similar elements are removed with their content; other disallowed tags are removed but their text
is kept.
*/
function sanitizeHtml(html) {
	if (typeof html !== 'string' || html === '') return ''
	let out = ''
	const open = []

	for (const token of tokenize(html)) {
		if (token.type === 'text') {
			out += escapeText(html.slice(token.from, token.to))
		} else if (token.type === 'start' && ALLOWED_TAGS.has(token.name)) {
			const attrs = []
			const seen = new Set()
			for (const attr of token.attrs) {
				// Browsers keep the first of duplicate attributes.
				if (seen.has(attr.name)) continue
				seen.add(attr.name)
				const check = Object.prototype.hasOwnProperty.call(ALLOWED_ATTRS, attr.name)
					? ALLOWED_ATTRS[attr.name]
					: undefined
				const value = check ? check(attr.value) : undefined
				if (value !== undefined) attrs.push({ name: attr.name, value })
			}
			if (VOID_TAGS.has(token.name)) {
				out += serializeStartTag(token.name, attrs)
			} else if (open.length < MAX_DEPTH) {
				out += serializeStartTag(token.name, attrs)
				open.push(token.name)
			}
		} else if (token.type === 'end' && open.includes(token.name)) {
			out += closeUpTo(open, token.name)
		}
	}
	while (open.length > 0) out += `</${open.pop()}>`
	return out
}

function serializeStartTag(name, attrs) {
	let out = `<${name}`
	for (const attr of attrs) out += ` ${attr.name}="${escapeAttribute(attr.value)}"`
	return `${out}>`
}

/**
Splits HTML into tokens, following the HTML tokenizer closely enough that a browser sees the
same tags. Tokens: { type: 'text' | 'start' | 'end' | 'skip', from, to, name?, attrs? }.
'skip' covers comments, doctypes and the content of raw text elements. Input that ends inside a
tag or comment yields a final 'skip' token.
*/
function tokenize(html) {
	const tokens = []
	let pos = 0
	const length = html.length
	// Lowercased once: doing it per raw text element would make hostile input quadratic.
	const lower = html.toLowerCase()

	const skipRest = from => {
		tokens.push({ from, to: length, type: 'skip' })
		pos = length
	}

	while (pos < length) {
		const lt = html.indexOf('<', pos)
		if (lt === -1) {
			tokens.push({ from: pos, to: length, type: 'text' })
			break
		}
		if (lt > pos) tokens.push({ from: pos, to: lt, type: 'text' })

		if (html.startsWith('<!--', lt)) {
			const close = html.indexOf('-->', lt + 4)
			if (close === -1) {
				skipRest(lt)
				break
			}
			pos = close + 3
			tokens.push({ from: lt, to: pos, type: 'skip' })
			continue
		}

		const next = html.charAt(lt + 1)
		if (next === '!' || next === '?' || (next === '/' && !/[a-z]/i.test(html.charAt(lt + 2)))) {
			// Doctype, processing instruction or a malformed end tag: a bogus comment up to ">".
			const close = html.indexOf('>', lt + 1)
			if (close === -1) {
				skipRest(lt)
				break
			}
			pos = close + 1
			tokens.push({ from: lt, to: pos, type: 'skip' })
			continue
		}

		const isEnd = next === '/'
		const nameStart = lt + (isEnd ? 2 : 1)
		if (!/[a-z]/i.test(html.charAt(nameStart))) {
			// A lone "<" is text.
			tokens.push({ from: lt, to: lt + 1, type: 'text' })
			pos = lt + 1
			continue
		}

		const tag = readTag(html, nameStart)
		if (tag === undefined) {
			skipRest(lt)
			break
		}
		pos = tag.to
		if (isEnd) {
			tokens.push({ from: lt, name: tag.name, to: pos, type: 'end' })
			continue
		}
		tokens.push({ attrs: tag.attrs, from: lt, name: tag.name, to: pos, type: 'start' })

		if (!RAW_TEXT_TAGS.has(tag.name)) continue
		const close = tag.name === 'plaintext' ? -1 : findRawTextEnd(lower, tag.name, pos)
		if (close === -1) {
			skipRest(pos)
			break
		}
		if (close > pos) tokens.push({ from: pos, to: close, type: 'skip' })
		pos = close
	}
	return tokens
}

function trimTrailingSlash(url) {
	return typeof url === 'string' ? url.trim().replace(/\/+$/, '') : ''
}

module.exports = { fileUrl, findMediaIds, publicBaseUrl, rewriteMediaSrc, sanitizeHtml }
