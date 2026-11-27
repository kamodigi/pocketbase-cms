import type { FormField } from './model'
import type { FormValue } from './values'

// Elements that are content without any text.
const textlessContent = 'audio, embed, hr, iframe, img, object, svg, table, video'

/**
Whether nothing has been entered. A switch always has a value, and a field without an input yet cannot
be told apart from a filled one. Rich text with only empty paragraphs or line breaks is blank.
*/
export function isBlank(field: FormField, value: FormValue): boolean {
	if (field.kind === 'toggle' || field.kind === 'pending') return false
	if (value === undefined) return true
	if (Array.isArray(value)) return value.length === 0
	if (typeof value !== 'string') return false
	if (field.field.type !== 'editor') return value.trim() === ''
	// Parsed without running anything in it.
	const { body } = new DOMParser().parseFromString(value, 'text/html')
	return body.textContent.trim() === '' && !body.querySelector(textlessContent)
}
