import type { SchemaField } from '#lib/config/index.js'

import { m } from '#paraglide/messages.js'

// PocketBase's limit for a file field whose `maxSize` is 0.
const defaultMaxSize = 5 * 1024 * 1024
const imageName = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i

/**
What the browser's file dialog offers: the field's accepted types, or images for the media library.
*/
export function acceptOf(field: SchemaField, isImagesOnly = false): string | undefined {
	const types = field.mimeTypes ?? []
	if (types.length > 0) return types.join(',')
	return isImagesOnly ? 'image/*' : undefined
}

/**
Why PocketBase would refuse a file for this field, checked before it is sent; undefined if it fits.
*/
export function fileError(file: File, field: SchemaField, uiLocale: string): string | undefined {
	const types = field.mimeTypes ?? []
	if (types.length > 0 && !types.includes(file.type)) return m.file_error_type({ name: file.name })
	const max = field.maxSize || defaultMaxSize
	return file.size > max ? m.file_error_size({ max: formatBytes(max, uiLocale), name: file.name }) : undefined
}

export function formatBytes(bytes: number, uiLocale: string): string {
	const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
	let value = bytes
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	return new Intl.NumberFormat(uiLocale, {
		maximumFractionDigits: unit === 0 ? 0 : 1,
		style: 'unit',
		unit: units[unit],
		unitDisplay: 'short',
	}).format(value)
}

/**
Whether a stored file is an image, by its name, which PocketBase keeps with its extension.
*/
export function isImageName(name: string): boolean {
	return imageName.test(name)
}
