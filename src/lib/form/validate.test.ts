import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'

import type { SchemaField } from '#lib/config/index.js'

import { buildFormModel, type FormField } from './model'
import { serverFieldErrors, validateField, validateForm } from './validate'

function formField(field: Omit<SchemaField, 'name'>, widget?: 'date'): FormField {
	const config = { collections: { c: { fields: { f: { widget } } } }, version: 1 } as const
	const model = buildFormModel(config, { fields: [{ ...field, name: 'f' }], name: 'c' }, 'en')
	return model.main[0]
}

const check = (field: Omit<SchemaField, 'name'>, value: Parameters<typeof validateField>[1], widget?: 'date') =>
	validateField(formField(field, widget), value, 'en')

describe('validateField', () => {
	it('refuses a blank value of a required field, as PocketBase does', () => {
		expect(check({ required: true, type: 'text' }, '')).toBe('This field is required.')
		expect(check({ required: true, type: 'number' }, 0)).toBe('This field is required.')
		expect(check({ required: true, type: 'bool' }, false)).toBe('This field is required.')
		expect(check({ maxSelect: 2, required: true, type: 'select', values: ['a'] }, [])).toBe('This field is required.')
		expect(check({ required: true, type: 'text' }, ' ')).toBeUndefined()
		// Without required, blank is fine and nothing else is checked.
		expect(check({ min: 3, pattern: '^a$', type: 'text' }, '')).toBeUndefined()
	})

	it('checks the length in characters and the pattern of a text', () => {
		expect(check({ min: 3, type: 'text' }, 'ab')).toBe('Enter at least 3 characters.')
		// An emoji is one character, though two UTF-16 units.
		expect(check({ max: 2, type: 'text' }, '☕️')).toBeUndefined()
		expect(check({ max: 2, type: 'text' }, 'abc')).toBe('Enter 2 characters or fewer.')
		// max 0 is PocketBase's default of 5000.
		expect(check({ max: 0, type: 'text' }, 'a'.repeat(5001))).toBe('Enter 5000 characters or fewer.')
		expect(check({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', type: 'text' }, 'Bad Slug')).toBe('The format is not valid.')
		expect(check({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', type: 'text' }, 'good-slug')).toBeUndefined()
	})

	it('checks the range and whole numbers', () => {
		expect(check({ max: 10, min: 1, type: 'number' }, 11)).toBe('Enter 10 or less.')
		expect(check({ max: 10, min: 1, type: 'number' }, -1)).toBe('Enter 1 or more.')
		expect(check({ onlyInt: true, type: 'number' }, 1.5)).toBe('Enter a whole number.')
		// eslint-disable-next-line unicorn/no-null -- PocketBase sends null for a number without bounds
		expect(check({ max: null, min: null, type: 'number' }, 1.5)).toBeUndefined()
	})

	it('wants a full web address within the allowed domains', () => {
		expect(check({ type: 'url' }, 'example.com')).toBe('Enter a full URL, such as https://example.com/.')
		expect(check({ type: 'url' }, 'javascript:alert(1)')).toBe('Enter a full URL, such as https://example.com/.')
		expect(check({ type: 'url' }, 'https://example.com/menu')).toBeUndefined()
		expect(check({ onlyDomains: ['example.com'], type: 'url' }, 'https://shop.example.com/')).toBe(
			'Only these domains can be used: example.com.',
		)
		expect(check({ exceptDomains: ['example.org'], type: 'url' }, 'https://example.org/')).toBe(
			'example.org cannot be used.',
		)
	})

	it('keeps a date within its range', () => {
		const range = { max: '2026-12-31 00:00:00.000Z', min: '2026-01-01 00:00:00.000Z', type: 'date' }
		expect(check(range, '2025-12-31', 'date')).toBe('Choose Jan 1, 2026 or later.')
		expect(check(range, '2027-01-01', 'date')).toBe('Choose Dec 31, 2026 or earlier.')
		expect(check(range, '2026-06-01', 'date')).toBeUndefined()
	})

	it('accepts only the choices of a select, up to maxSelect', () => {
		expect(check({ maxSelect: 1, type: 'select', values: ['a', 'b'] }, 'c')).toBe('Choose one of the options.')
		expect(check({ maxSelect: 2, type: 'select', values: ['a', 'b', 'c'] }, ['a', 'b', 'c'])).toBe('Choose up to 2.')
		expect(check({ maxSelect: 2, type: 'select', values: ['a', 'b', 'c'] }, ['a', 'c'])).toBeUndefined()
	})
})

describe('validateField on a relation', () => {
	const several = { maxSelect: 3, minSelect: 2, type: 'relation' }

	it('counts the records of a relation that holds several', () => {
		expect(check(several, [])).toBeUndefined()
		expect(check({ ...several, required: true }, [])).toBe('This field is required.')
		expect(check(several, ['a'])).toBe('Choose at least 2.')
		expect(check(several, ['a', 'b'])).toBeUndefined()
		expect(check(several, ['a', 'b', 'c', 'd'])).toBe('Choose up to 3.')
		expect(check({ maxSelect: 1, required: true, type: 'relation' }, '')).toBe('This field is required.')
	})

	it('counts the files of a file field', () => {
		const photo = new File(['x'], 'a.png', { type: 'image/png' })
		expect(check({ required: true, type: 'file' }, [])).toBe('This field is required.')
		expect(check({ required: true, type: 'file' }, [photo])).toBeUndefined()
		expect(check({ maxSelect: 2, type: 'file' }, ['a.png', photo])).toBeUndefined()
		expect(check({ maxSelect: 2, type: 'file' }, ['a.png', 'b.png', photo])).toBe('Up to 2 files.')
	})
})

describe('validateForm', () => {
	it('skips fields that are not sent', () => {
		const model = buildFormModel(
			{ collections: { c: { fields: { code: { readonly: true } } } }, version: 1 },
			{
				fields: [
					{ name: 'code', required: true, type: 'text' },
					{ name: 'title', required: true, type: 'text' },
					{ name: 'location', required: true, type: 'geoPoint' },
				],
				name: 'c',
			},
			'en',
		)

		expect(validateForm(model, { code: '', title: '' }, 'en')).toEqual({ title: 'This field is required.' })
	})
})

describe('serverFieldErrors', () => {
	it('reads the messages of a refused save by field', () => {
		const error = new ClientResponseError({
			response: {
				data: { slug: { code: 'validation_not_unique', message: 'Value must be unique.' } },
				message: 'Failed to create record.',
			},
			status: 400,
		})

		expect(serverFieldErrors(error)).toEqual({ slug: 'Value must be unique.' })
		expect(serverFieldErrors(new ClientResponseError({ status: 403 }))).toEqual({})
	})
})
