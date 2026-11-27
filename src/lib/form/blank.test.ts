import { describe, expect, it } from 'vitest'

import type { FormField, InputKind } from './model'

import { isBlank } from './blank'

function field(kind: InputKind, type = 'text'): FormField {
	return { field: { name: 'title', type }, kind, label: 'Title', name: 'title', options: [], readonly: false }
}

describe('isBlank', () => {
	it('is true for text with nothing but spaces, no number and an empty choice', () => {
		expect(isBlank(field('text'), '')).toBe(true)
		expect(isBlank(field('textarea'), ' \n ')).toBe(true)
		expect(isBlank(field('number', 'number'), undefined)).toBe(true)
		expect(isBlank(field('checkboxes', 'select'), [])).toBe(true)
	})

	it('is false for any entered value', () => {
		expect(isBlank(field('text'), 'Winter')).toBe(false)
		expect(isBlank(field('number', 'number'), 0)).toBe(false)
		expect(isBlank(field('relations', 'relation'), ['a1'])).toBe(false)
	})

	it('is false for a switch, which is never empty, and for a field without an input', () => {
		expect(isBlank(field('toggle', 'bool'), false)).toBe(false)
		expect(isBlank(field('pending', 'file'), undefined)).toBe(false)
	})

	it('looks at what rich text shows, not at its markup', () => {
		const editor = field('textarea', 'editor')
		expect(isBlank(editor, '<p></p>')).toBe(true)
		expect(isBlank(editor, '<p><br>&nbsp;</p>')).toBe(true)
		expect(isBlank(editor, '<p>At the pier.</p>')).toBe(false)
		expect(isBlank(editor, '<p><img src="/pier.png" alt=""></p>')).toBe(false)
		// Markup typed into a plain text field is text.
		expect(isBlank(field('textarea'), '<p></p>')).toBe(false)
	})
})
