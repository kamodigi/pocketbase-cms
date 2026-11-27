// The kinds of block the toolbar and the slash menu turn a line into or insert.
import type { Editor } from '@tiptap/core'

import Heading1Icon from '@lucide/svelte/icons/heading-1'
import Heading2Icon from '@lucide/svelte/icons/heading-2'
import Heading3Icon from '@lucide/svelte/icons/heading-3'
import Heading4Icon from '@lucide/svelte/icons/heading-4'
import Heading5Icon from '@lucide/svelte/icons/heading-5'
import Heading6Icon from '@lucide/svelte/icons/heading-6'
import ImagePlusIcon from '@lucide/svelte/icons/image-plus'
import ListIcon from '@lucide/svelte/icons/list'
import ListOrderedIcon from '@lucide/svelte/icons/list-ordered'
import MinusIcon from '@lucide/svelte/icons/minus'
import PilcrowIcon from '@lucide/svelte/icons/pilcrow'
import SquareCodeIcon from '@lucide/svelte/icons/square-code'
import TableIcon from '@lucide/svelte/icons/table'
import TextQuoteIcon from '@lucide/svelte/icons/text-quote'

import { m } from '#paraglide/messages.js'

import type { EditorSettings } from './settings'

export interface Block {
	icon: typeof ListIcon
	/**
	Whether the line at the cursor is this kind of block; undefined for blocks that are only inserted.
	*/
	isActive?: (editor: Editor) => boolean
	label: string
	name: string
	/**
	Turns the current line into this block, or inserts it.
	*/
	run: (editor: Editor) => void
}

const headingIcons = [Heading1Icon, Heading2Icon, Heading3Icon, Heading4Icon, Heading5Icon, Heading6Icon]

/**
The blocks one field's settings offer, in the order the slash menu lists them. `onimage` opens the
image picker.
*/
export function editorBlocks(settings: EditorSettings, onimage: () => void): Block[] {
	const has = (feature: Parameters<typeof settings.features.has>[0]) => settings.features.has(feature)
	const blocks: Block[] = [
		{
			icon: PilcrowIcon,
			isActive: editor => editor.isActive('paragraph'),
			label: m.editor_paragraph(),
			name: 'paragraph',
			run: editor => editor.chain().focus().setParagraph().run(),
		},
	]
	for (const level of settings.headingLevels) {
		blocks.push({
			icon: headingIcons[level - 1]!,
			isActive: editor => editor.isActive('heading', { level }),
			label: m.editor_heading({ level }),
			name: `heading${level}`,
			run: editor => editor.chain().focus().toggleHeading({ level }).run(),
		})
	}
	if (has('bulletList')) {
		blocks.push({
			icon: ListIcon,
			isActive: editor => editor.isActive('bulletList'),
			label: m.editor_bullet_list(),
			name: 'bulletList',
			run: editor => editor.chain().focus().toggleBulletList().run(),
		})
	}
	if (has('orderedList')) {
		blocks.push({
			icon: ListOrderedIcon,
			isActive: editor => editor.isActive('orderedList'),
			label: m.editor_ordered_list(),
			name: 'orderedList',
			run: editor => editor.chain().focus().toggleOrderedList().run(),
		})
	}
	if (has('blockquote')) {
		blocks.push({
			icon: TextQuoteIcon,
			isActive: editor => editor.isActive('blockquote'),
			label: m.editor_blockquote(),
			name: 'blockquote',
			run: editor => editor.chain().focus().toggleBlockquote().run(),
		})
	}
	if (has('codeBlock')) {
		blocks.push({
			icon: SquareCodeIcon,
			isActive: editor => editor.isActive('codeBlock'),
			label: m.editor_code_block(),
			name: 'codeBlock',
			run: editor => editor.chain().focus().toggleCodeBlock().run(),
		})
	}
	if (has('horizontalRule')) {
		blocks.push({
			icon: MinusIcon,
			label: m.editor_horizontal_rule(),
			name: 'horizontalRule',
			run: editor => editor.chain().focus().setHorizontalRule().run(),
		})
	}
	if (has('image')) {
		blocks.push({ icon: ImagePlusIcon, label: m.editor_image(), name: 'image', run: () => onimage() })
	}
	if (has('table')) {
		blocks.push({
			icon: TableIcon,
			label: m.editor_table(),
			name: 'table',
			run: editor => editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
		})
	}
	return blocks
}
