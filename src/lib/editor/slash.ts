import type { EditorState } from '@tiptap/pm/state'

/**
The text after "/" when the cursor is at the end of a paragraph that holds only "/" and a word: the
slash menu's search. Undefined otherwise.
*/
export function slashQuery(state: EditorState): string | undefined {
	const { $from, empty } = state.selection
	if (!empty || $from.parent.type.name !== 'paragraph' || $from.depth !== 1) return undefined
	const text = $from.parent.textContent
	if ($from.parentOffset !== text.length) return undefined
	const match = /^\/([^\s/]{0,20})$/.exec(text)
	return match?.[1]
}
