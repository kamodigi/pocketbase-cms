// Unsaved input of an edit screen, kept in the browser until it is saved or discarded, or its editor
// signs out (decision 40). Storage can be unavailable or full; the form then works as before, without drafts.
import type { RecordModel } from 'pocketbase'

import type { FormModel } from './model'

import { editableFields, type FormValue, type FormValues, isFileKind, isSameValue, toInputValue } from './values'

export interface Draft {
	/**
	For slugs with a source field: whether the user wrote the slug, so it stops following the source.
	*/
	ownSlugs: Record<string, boolean>
	/**
	The `updated` of the record the input was made on; empty for a new record or without that field.
	*/
	recordUpdated: string
	/**
	When the draft was written, as an ISO 8601 string.
	*/
	savedAt: string
	/**
	Only the fields that differed from the record.
	*/
	values: FormValues
}

/**
The values of the editable fields that differ from the ones the form started with.
*/
export function changedValues(model: FormModel, values: FormValues, initial: FormValues): FormValues {
	const changed: FormValues = {}
	for (const field of editableFields(model)) {
		// Files cannot be kept in the browser's storage: a chosen file is lost with the tab.
		if (isFileKind(field)) continue
		const blank = toInputValue(field, undefined)
		const value = values[field.name] ?? blank
		if (!isSameValue(value, initial[field.name] ?? blank)) changed[field.name] = value
	}
	return changed
}

/**
One draft per editor and record; every new record of a collection shares one.
*/
export function draftKey(userId: string, collection: string, recordId = 'new'): string {
	return `${userPrefix(userId)}${collection}/${recordId}`
}

/**
Whether the record was saved again after the draft's input was made on it. Unknown counts as not.
*/
export function isSavedSince(draft: Draft, record: RecordModel | undefined): boolean {
	const updated = recordUpdated(record)
	return draft.recordUpdated !== '' && updated !== '' && draft.recordUpdated !== updated
}

/**
The stored draft, as far as it still applies: fields the form no longer has, values of another type
(the schema changed) and values the record already holds are dropped. A draft with nothing left is
removed.
*/
export function readDraft(key: string, model: FormModel, initial: FormValues): Draft | undefined {
	const text = storedText(key)
	if (text === undefined) return undefined

	const stored = parse(text)
	const usable: FormValues = {}
	for (const field of editableFields(model)) {
		if (!stored || !Object.hasOwn(stored.values, field.name)) continue
		const value = stored.values[field.name]
		const blank = toInputValue(field, undefined)
		// An emptied number input is stored as ''.
		if (blank === undefined && value === '') usable[field.name] = undefined
		else if (isFitting(value, blank)) usable[field.name] = value
	}
	// A field the draft does not hold keeps the record's value.
	const values = changedValues(model, { ...initial, ...usable }, initial)
	if (!stored || Object.keys(values).length === 0) {
		removeDraft(key)
		return undefined
	}
	return { ...stored, values }
}

export function recordUpdated(record: RecordModel | undefined): string {
	const updated: unknown = record?.['updated']
	return typeof updated === 'string' ? updated : ''
}

export function removeDraft(key: string): void {
	try {
		localStorage.removeItem(key)
	} catch {
		// Nothing was stored.
	}
}

/**
Removes every draft of one editor, so that a shared computer keeps nothing after signing out.
*/
export function removeUserDrafts(userId: string): void {
	try {
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith(userPrefix(userId))) localStorage.removeItem(key)
		}
	} catch {
		// Nothing was stored.
	}
}

export function writeDraft(key: string, draft: Draft): void {
	// JSON has no undefined, which is what an empty number input holds.
	const text = JSON.stringify(draft, (_, value: unknown) => (value === undefined ? '' : value))
	try {
		localStorage.setItem(key, text)
	} catch {
		// An older draft would bring back older input.
		removeDraft(key)
	}
}

/**
Whether a stored value is of the kind an input with this blank value holds.
*/
function isFitting(value: unknown, blank: FormValue): value is FormValue {
	if (Array.isArray(blank)) return Array.isArray(value) && value.every(item => typeof item === 'string')
	// Only a number input is blank as undefined.
	return typeof value === (blank === undefined ? 'number' : typeof blank)
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parse(text: string): (Omit<Draft, 'values'> & { values: Record<string, unknown> }) | undefined {
	let data: unknown
	try {
		data = JSON.parse(text)
	} catch {
		return undefined
	}
	if (!isObject(data) || !isObject(data.values)) return undefined
	const { ownSlugs, recordUpdated, savedAt, values } = data
	if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) return undefined
	return {
		ownSlugs: isObject(ownSlugs)
			? Object.fromEntries(Object.entries(ownSlugs).map(([name, own]) => [name, own === true]))
			: {},
		recordUpdated: typeof recordUpdated === 'string' ? recordUpdated : '',
		savedAt,
		values,
	}
}

function storedText(key: string): string | undefined {
	try {
		return localStorage.getItem(key) ?? undefined
	} catch {
		return undefined
	}
}

function userPrefix(userId: string): string {
	return `pbcms:draft:${userId}:`
}
