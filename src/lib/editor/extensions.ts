// The Tiptap extensions of the rich text editor. Everything they write stays inside the allowlist of
// the sanitizer that PocketBase runs on save (hooks/pb_hooks/pbcms/html.cjs, pbcms/html.go), so what
// the editor shows is what is stored; extensions.test.ts checks that the sanitizer keeps it unchanged.
import { type AnyExtension, mergeAttributes, Node } from '@tiptap/core'
import { Heading } from '@tiptap/extension-heading'
import { Image } from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { TextAlign } from '@tiptap/extension-text-align'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { StarterKit } from '@tiptap/starter-kit'

import type { HeadingLevel } from '#lib/config/index.js'

import type { EditorSettings } from './settings'

/**
The attributes of a figure: an image, with an optional caption and link.
*/
export interface FigureAttributes extends ImageAttributes {
	caption?: string
	href?: string
}

/**
The attributes of an image the editor stores: `<img src alt width height data-media-id>` (decision 38).
*/
export interface ImageAttributes {
	alt?: string
	height?: number
	/**
	The id of the media record, which PocketBase uses to point `src` at its current file on read.
	*/
	mediaId?: string
	src: string
	width?: number
}

/**
A short, stable id from the heading's text, so that links to `#id` survive saving. Text in any script
works, unlike a slug.
*/
export function headingId(text: string): string {
	// djb2
	let hash = 5381
	for (const char of text) {
		hash = ((hash << 5) + hash) ^ char.codePointAt(0)!
		hash >>>= 0
	}
	return `h${hash.toString(16).padStart(7, '0').slice(-7)}`
}

/**
Headings of `levels`, each with an id made from its text on every save, so that it never goes stale.
*/
function headingWithId(levels: HeadingLevel[]) {
	return Heading.extend({
		renderHTML({ HTMLAttributes, node }) {
			const asked = node.attrs.level as HeadingLevel
			const level = levels.includes(asked) ? asked : levels[0]
			const id = node.textContent.trim() === '' ? {} : { id: headingId(node.textContent) }
			return [`h${level}`, mergeAttributes(HTMLAttributes, id), 0]
		},
	}).configure({ levels })
}

function imageHtml(attributes: ImageAttributes): Record<string, string> {
	const html: Record<string, string> = { alt: attributes.alt ?? '', src: attributes.src }
	// An empty alt marks an image as decorative; it is always written.
	if (attributes.width) html.width = String(attributes.width)
	if (attributes.height) html.height = String(attributes.height)
	if (attributes.mediaId) html['data-media-id'] = attributes.mediaId
	return html
}

function positive(value: null | string): number | undefined {
	const number = Number(value)
	return value !== null && Number.isSafeInteger(number) && number > 0 ? number : undefined
}

function readImage(img: HTMLElement): ImageAttributes {
	return {
		alt: img.getAttribute('alt') ?? undefined,
		height: positive(img.getAttribute('height')),
		mediaId: img.dataset.mediaId,
		src: img.getAttribute('src') ?? '',
		width: positive(img.getAttribute('width')),
	}
}

/**
An image on its own line, with an optional caption and link:
`<figure><a href><img></a><figcaption></figcaption></figure>`. Images are inserted as figures.
*/
export const Figure = Node.create({
	addAttributes() {
		// Read and written as a whole in parseHTML and renderHTML.
		const plain = { default: undefined, rendered: false }
		return { alt: plain, caption: plain, height: plain, href: plain, mediaId: plain, src: plain, width: plain }
	},
	atom: true,
	draggable: true,
	group: 'block',
	name: 'figure',

	parseHTML() {
		return [
			{
				getAttrs: element => {
					const img = element.querySelector('img')
					if (!img?.getAttribute('src')) return false
					const caption = element.querySelector('figcaption')?.textContent.trim()
					return {
						...readImage(img),
						caption: caption || undefined,
						href: element.querySelector('a')?.getAttribute('href') ?? undefined,
					}
				},
				tag: 'figure',
			},
		]
	},

	renderHTML({ node }) {
		const attributes = node.attrs as FigureAttributes
		const img = ['img', imageHtml(attributes)]
		const inner = attributes.href ? ['a', { href: attributes.href }, img] : img
		return attributes.caption ? ['figure', {}, inner, ['figcaption', {}, attributes.caption]] : ['figure', {}, inner]
	},
})

/**
An image inside text, as older content and pasted HTML may have. Its media id is kept.
*/
const InlineImage = Image.extend({
	addAttributes() {
		const plain = { default: undefined, rendered: false }
		return { alt: plain, height: plain, mediaId: plain, src: plain, width: plain }
	},
	parseHTML() {
		return [{ getAttrs: element => readImage(element), tag: 'img[src]:not([src^="data:"])' }]
	},
	renderHTML({ node }) {
		return ['img', imageHtml(node.attrs as ImageAttributes)]
	},
}).configure({ inline: true })

/**
A table without the `<colgroup>` that Tiptap adds for column widths, which the sanitizer drops.
*/
const PlainTable = Table.extend({
	renderHTML({ HTMLAttributes }) {
		return ['table', HTMLAttributes, ['tbody', 0]]
	},
}).configure({ resizable: false })

/**
The extensions for one field's settings. A feature that is off is not only hidden: its markup is
dropped from the content, as the sanitizer would drop markup outside its allowlist.
*/
export function editorExtensions(settings: EditorSettings): AnyExtension[] {
	const has = (feature: Parameters<typeof settings.features.has>[0]) => settings.features.has(feature)
	const hasList = has('bulletList') || has('orderedList')
	const extensions: AnyExtension[] = [
		StarterKit.configure({
			blockquote: has('blockquote') ? {} : false,
			bold: has('bold') ? {} : false,
			bulletList: has('bulletList') ? {} : false,
			code: has('code') ? {} : false,
			codeBlock: has('codeBlock') ? {} : false,
			// Replaced by headingWithId.
			heading: false,
			horizontalRule: has('horizontalRule') ? {} : false,
			italic: has('italic') ? {} : false,
			link: has('link')
				? // eslint-disable-next-line unicorn/no-null -- null leaves out Tiptap's default target and rel
					{ autolink: true, HTMLAttributes: { rel: null, target: null }, openOnClick: false }
				: false,
			listItem: hasList ? {} : false,
			listKeymap: hasList ? {} : false,
			orderedList: has('orderedList') ? {} : false,
			strike: has('strike') ? {} : false,
			underline: has('underline') ? {} : false,
		}),
	]
	if (has('heading')) extensions.push(headingWithId(settings.headingLevels))
	if (has('textColor')) extensions.push(TextStyle, Color)
	if (has('textAlign')) {
		extensions.push(TextAlign.configure({ types: has('heading') ? ['heading', 'paragraph'] : ['paragraph'] }))
	}
	if (has('image')) extensions.push(Figure, InlineImage)
	if (has('table')) extensions.push(PlainTable, TableRow, TableHeader, TableCell)
	return extensions
}
