import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'

import { slashQuery } from './slash'

const opened: Editor[] = []

afterEach(() => {
	for (const editor of opened.splice(0)) editor.destroy()
})

function queryAtEnd(content: string): string | undefined {
	const editor = new Editor({ content, element: document.createElement('div'), extensions: [StarterKit] })
	opened.push(editor)
	editor.commands.focus('end')
	return slashQuery(editor.state)
}

describe('slashQuery', () => {
	it('is the word after "/" alone on a paragraph', () => {
		expect(queryAtEnd('<p>/</p>')).toBe('')
		expect(queryAtEnd('<p>/quo</p>')).toBe('quo')
	})

	it('is undefined for other text, and outside a top-level paragraph', () => {
		expect(queryAtEnd('<p>a/b</p>')).toBeUndefined()
		expect(queryAtEnd('<p>/two words</p>')).toBeUndefined()
		expect(queryAtEnd('<h2>/</h2>')).toBeUndefined()
		expect(queryAtEnd('<ul><li><p>/</p></li></ul>')).toBeUndefined()
	})
})
