import { ClientResponseError } from 'pocketbase'

import { parseDate } from '#lib/list/request.js'
import { m } from '#paraglide/messages.js'

import type { FormField, FormModel } from './model'

import { editableFields, type FormValue, type FormValues, toPocketBaseValue } from './values'

/**
Messages by PocketBase field name.
*/
export type FieldErrors = Record<string, string>

// PocketBase's limit for a text field whose `max` is 0.
const defaultTextMax = 5000

/**
The messages PocketBase gave for each field when it refused a create or an update.
*/
export function serverFieldErrors(error: unknown): FieldErrors {
	if (!(error instanceof ClientResponseError) || error.status !== 400) return {}
	const data: unknown = error.response.data
	const errors: FieldErrors = {}
	if (data && typeof data === 'object') {
		for (const [name, detail] of Object.entries(data)) {
			const message: unknown = detail && typeof detail === 'object' ? (detail as { message?: unknown }).message : detail
			if (typeof message === 'string') errors[name] = message
		}
	}
	return errors
}

/**
The first problem with one value, or undefined.
*/
export function validateField(form: FormField, value: FormValue, uiLocale: string): string | undefined {
	const { field } = form
	if (isBlank(form, value)) return field.required ? m.form_error_required() : undefined

	switch (form.kind) {
		case 'checkboxes':
		case 'select': {
			const chosen = Array.isArray(value) ? value : [String(value)]
			if (chosen.some(item => !(field.values ?? []).includes(item))) return m.form_error_option()
			const max = field.maxSelect ?? 1
			return form.kind === 'checkboxes' && chosen.length > max ? m.form_error_max_select({ max }) : undefined
		}
		case 'date':
		case 'datetime': {
			return dateError(form, value, uiLocale)
		}
		case 'number': {
			return numberError(form, value)
		}
		case 'relations': {
			const count = Array.isArray(value) ? value.length : 1
			const max = field.maxSelect ?? 1
			if (count > max) return m.form_error_max_select({ max })
			const min = field.minSelect ?? 0
			return count < min ? m.form_error_min_select({ min }) : undefined
		}
		case 'slug':
		case 'text':
		case 'textarea': {
			// The body of an editor field is HTML, checked by size on the server only.
			return field.type === 'text' ? textError(form, String(value)) : undefined
		}
		case 'url': {
			return urlError(form, String(value))
		}
		default: {
			return undefined
		}
	}
}

/**
Checks the values by the rules PocketBase will apply on save (the field's required, min, max,
pattern, choices and domains), so that the editor sees what to fix before sending.
*/
export function validateForm(model: FormModel, values: FormValues, uiLocale: string): FieldErrors {
	const errors: FieldErrors = {}
	for (const field of editableFields(model)) {
		const message = validateField(field, values[field.name], uiLocale)
		if (message !== undefined) errors[field.name] = message
	}
	return errors
}

function dateError(form: FormField, value: FormValue, uiLocale: string): string | undefined {
	const date = parseDate(String(toPocketBaseValue(form, value)))
	if (Number.isNaN(date.getTime())) return m.form_error_date()
	const { max, min } = form.field
	const format = (bound: Date) =>
		new Intl.DateTimeFormat(uiLocale, {
			dateStyle: 'medium',
			...(form.kind === 'date' ? { timeZone: 'UTC' } : { timeStyle: 'short' }),
		}).format(bound)
	const earliest = typeof min === 'string' && min !== '' ? parseDate(min) : undefined
	if (earliest && date < earliest) return m.form_error_date_min({ date: format(earliest) })
	const latest = typeof max === 'string' && max !== '' ? parseDate(max) : undefined
	return latest && date > latest ? m.form_error_date_max({ date: format(latest) }) : undefined
}

/**
Blank in PocketBase's sense: what `required` refuses. A number is blank at 0 and a switch when off.
*/
function isBlank(form: FormField, value: FormValue): boolean {
	if (Array.isArray(value)) return value.length === 0
	if (form.kind === 'number') return typeof value !== 'number' || value === 0
	if (form.kind === 'toggle') return value !== true
	return value === undefined || value === ''
}

function numberError({ field }: FormField, value: FormValue): string | undefined {
	const number = Number(value)
	if (typeof value !== 'number' || !Number.isFinite(number)) return m.form_error_number()
	if (field.onlyInt && !Number.isSafeInteger(number)) return m.form_error_integer()
	if (typeof field.min === 'number' && number < field.min) return m.form_error_min({ min: field.min })
	if (typeof field.max === 'number' && number > field.max) return m.form_error_max({ max: field.max })
	return undefined
}

function textError({ field }: FormField, value: string): string | undefined {
	// PocketBase counts characters (code points), not UTF-16 units.
	const length = [...value].length
	const min = typeof field.min === 'number' ? field.min : 0
	if (min > 0 && length < min) return m.form_error_min_length({ min })
	const max = typeof field.max === 'number' && field.max > 0 ? field.max : defaultTextMax
	if (length > max) return m.form_error_max_length({ max })
	if (field.pattern && !new RegExp(field.pattern).test(value)) return m.form_error_pattern()
	return undefined
}

function urlError({ field }: FormField, value: string): string | undefined {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return m.form_error_url()
	}
	if (!/^https?:$/.test(url.protocol) || url.hostname === '') return m.form_error_url()
	// PocketBase compares the host name exactly: a subdomain is another domain.
	const host = url.hostname
	const only = field.onlyDomains ?? []
	if (only.length > 0 && !only.includes(host)) return m.form_error_domain({ domains: only.join(', ') })
	if ((field.exceptDomains ?? []).includes(host)) {
		return m.form_error_domain_refused({ domain: host })
	}
	return undefined
}
