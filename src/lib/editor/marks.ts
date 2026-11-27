// The text styles the toolbar and the bubble menu toggle.
import type { Editor } from '@tiptap/core'

import BoldIcon from '@lucide/svelte/icons/bold'
import CodeIcon from '@lucide/svelte/icons/code'
import ItalicIcon from '@lucide/svelte/icons/italic'
import StrikethroughIcon from '@lucide/svelte/icons/strikethrough'
import UnderlineIcon from '@lucide/svelte/icons/underline'

import { m } from '#paraglide/messages.js'

import type { EditorSettings } from './settings'

export interface Mark {
	icon: typeof BoldIcon
	label: string
	/**
	The Tiptap mark, for `editor.isActive`.
	*/
	name: 'bold' | 'code' | 'italic' | 'strike' | 'underline'
	toggle: (editor: Editor) => void
}

/**
The marks one field's settings offer.
*/
export function editorMarks(settings: EditorSettings): Mark[] {
	const all: Mark[] = [
		{
			icon: BoldIcon,
			label: m.editor_bold(),
			name: 'bold',
			toggle: editor => editor.chain().focus().toggleBold().run(),
		},
		{
			icon: ItalicIcon,
			label: m.editor_italic(),
			name: 'italic',
			toggle: editor => editor.chain().focus().toggleItalic().run(),
		},
		{
			icon: UnderlineIcon,
			label: m.editor_underline(),
			name: 'underline',
			toggle: editor => editor.chain().focus().toggleUnderline().run(),
		},
		{
			icon: StrikethroughIcon,
			label: m.editor_strike(),
			name: 'strike',
			toggle: editor => editor.chain().focus().toggleStrike().run(),
		},
		{
			icon: CodeIcon,
			label: m.editor_code(),
			name: 'code',
			toggle: editor => editor.chain().focus().toggleCode().run(),
		},
	]
	return all.filter(mark => settings.features.has(mark.name))
}
