import type { RecordModel } from 'pocketbase'

import { parseDate } from '#lib/list/request.js'
import { mediaMetadata } from '#lib/media/library.js'

import type { FormField, FormModel } from './model'

/**
The files of a file field: the names of the stored ones it keeps, and the new ones to upload.
*/
export type FileValue = (File | string)[]

/**
What an input holds: text (also dates, as the input writes them), a number or nothing, an on/off
switch, a list of choices or record ids, or files.
*/
export type FormValue = boolean | FileValue | number | string | string[] | undefined

export type FormValues = Record<string, FormValue>

/**
The fields whose values the form sends.
*/
export function editableFields(model: FormModel): FormField[] {
	return [...model.main, ...model.side].filter(field => !field.readonly && field.kind !== 'pending')
}

/**
The values the inputs start with: the record's, or blanks for a new record.
*/
export function initialValues(model: FormModel, record: RecordModel | undefined): FormValues {
	const values: FormValues = {}
	for (const field of [...model.main, ...model.side]) {
		if (field.kind === 'pending') continue
		values[field.name] = toInputValue(field, record?.[field.name])
	}
	return values
}

export function isFileKind(field: FormField): boolean {
	return field.kind === 'file' || field.kind === 'files'
}

export function isSameValue(a: FormValue, b: FormValue): boolean {
	return Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((item, i) => item === b[i]) : a === b
}

/**
The body of a create or an update. An update sends only what changed, so a value the CMS cannot show
exactly (such as the seconds of a date) stays as it was. A create also fills the `autofill` fields.
*/
export function recordPayload(
	model: FormModel,
	values: FormValues,
	{ initial, now, userId }: { initial?: FormValues; now: Date; userId?: string },
): Record<string, unknown> {
	const payload: Record<string, unknown> = {}
	for (const field of editableFields(model)) {
		const value = values[field.name] ?? toInputValue(field, undefined)
		const before = initial && (initial[field.name] ?? toInputValue(field, undefined))
		if (initial && isSameValue(value, before)) continue
		if (isFileKind(field)) Object.assign(payload, filePayload(field, value, before))
		else payload[field.name] = toPocketBaseValue(field, value)
	}
	// An image uploaded to the media library saves its size and type (decision 12).
	const upload = model.media && fileList(values[model.media.file]).find(item => item instanceof File)
	if (upload && model.media) Object.assign(payload, mediaMetadata(model.media, upload))
	if (!initial) {
		for (const { kind, name } of model.autofill) {
			if (kind === 'now') payload[name] = pocketBaseDate(now)
			else if (userId !== undefined) payload[name] = userId
		}
	}
	return payload
}

/**
A slug suggested from a title: lowercase ASCII letters and digits joined by hyphens. Letters with
accents lose them; other scripts (such as Japanese) are dropped, so the slug may come out empty.
*/
export function slugify(text: string): string {
	return text
		.normalize('NFKD')
		.replaceAll(/\p{M}/gu, '')
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, '-')
		.replaceAll(/^-+|-+$/g, '')
}

/**
A plain copy of the form's values. Unlike `$state.snapshot`, it keeps the chosen files themselves,
which `structuredClone` would copy (losing what is known about them) or drop.
*/
export function snapshotValues(values: FormValues): FormValues {
	return Object.fromEntries(
		Object.entries(values).map(([name, value]) => [name, Array.isArray(value) ? [...value] : value]),
	)
}

/**
A PocketBase value as its input holds it.
*/
export function toInputValue(field: FormField, value: unknown): FormValue {
	switch (field.kind) {
		case 'autodate': {
			return typeof value === 'string' ? value : ''
		}
		case 'checkboxes':
		case 'relations': {
			return Array.isArray(value) ? value.map(String) : typeof value === 'string' && value !== '' ? [value] : []
		}
		case 'date': {
			// A day without a time is stored as midnight UTC.
			const date = typeof value === 'string' && value !== '' ? parseDate(value) : undefined
			return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ''
		}
		case 'datetime': {
			const date = typeof value === 'string' && value !== '' ? parseDate(value) : undefined
			return date && !Number.isNaN(date.getTime()) ? localDateTime(date) : ''
		}
		case 'file':
		case 'files': {
			// One file is stored as a name, several as a list.
			return Array.isArray(value) ? value.map(String) : typeof value === 'string' && value !== '' ? [value] : []
		}
		case 'number': {
			// PocketBase stores a blank number as 0; it is shown as 0, not as an empty input.
			return typeof value === 'number' ? value : undefined
		}
		case 'toggle': {
			return value === true
		}
		default: {
			if (Array.isArray(value)) return value[0] === undefined ? '' : String(value[0])
			return value === undefined || value === null ? '' : String(value)
		}
	}
}

/**
An input's value as PocketBase takes it.
*/
export function toPocketBaseValue(field: FormField, value: FormValue): unknown {
	switch (field.kind) {
		case 'date': {
			return value === '' ? '' : `${String(value)} 00:00:00.000Z`
		}
		case 'datetime': {
			if (value === '') return ''
			// datetime-local is in the browser's time zone; PocketBase keeps UTC.
			const date = new Date(String(value))
			return Number.isNaN(date.getTime()) ? String(value) : pocketBaseDate(date)
		}
		case 'number': {
			// PocketBase has no empty number: a cleared input saves 0.
			return value === undefined || value === '' ? 0 : value
		}
		default: {
			return value
		}
	}
}

function fileList(value: FormValue): FileValue {
	return Array.isArray(value) ? value : []
}

/**
How PocketBase takes a change of files. A single file is replaced by sending the new one, or removed
by sending "". Several are changed with the `-` (remove these names) and `+` (append these files)
modifiers, so the ones kept are never sent again.
*/
function filePayload(field: FormField, value: FormValue, before: FormValue | undefined): Record<string, unknown> {
	const files = fileList(value)
	const added = files.filter(item => item instanceof File)
	if (field.kind === 'file') return { [field.name]: added.at(-1) ?? files[0] ?? '' }
	// A new record has no stored files.
	if (before === undefined) return { [field.name]: added }

	const kept = new Set(files.filter(item => typeof item === 'string'))
	const removed = fileList(before).filter(item => typeof item === 'string' && !kept.has(item))
	const payload: Record<string, unknown> = {}
	if (removed.length > 0) payload[`${field.name}-`] = removed
	if (added.length > 0) payload[`${field.name}+`] = added
	return payload
}

function localDateTime(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(n: number): string {
	return String(n).padStart(2, '0')
}

/**
PocketBase writes dates as "2026-01-31 09:00:00.000Z".
*/
function pocketBaseDate(date: Date): string {
	return date.toISOString().replace('T', ' ')
}
