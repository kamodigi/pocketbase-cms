import type PocketBase from 'pocketbase'
import type { RecordModel } from 'pocketbase'

import { type CmsConfig, resolveLabel, type SchemaCollection } from '#lib/config/index.js'
import { nameKeys, recordName } from '#lib/relation/name.js'
import { m } from '#paraglide/messages.js'

import { type Column, type ListModel } from './model'
import { type PublishState } from './query'
import { parseDate, publishState } from './request'

export type Cell =
	| { badge: string; kind: 'badge' }
	| { dateTime: string; kind: 'date'; text: string }
	| { files: ListFile[]; kind: 'files' }
	| { href: string; kind: 'link' }
	| { kind: 'empty' }
	| { kind: 'status'; state: PublishState }
	| { kind: 'text'; text: string }

export interface CellContext {
	config: CmsConfig
	/**
	Needed to read protected files.
	*/
	fileToken?: string
	model: ListModel
	now: Date
	pb: PocketBase
	schema: SchemaCollection[]
	uiLocale: string
}

export interface ListFile {
	name: string
	/**
	Set for images, which are shown in place of the name.
	*/
	thumbnail?: string
}

const empty: Cell = { kind: 'empty' }
const imageName = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i
// PocketBase makes this size for any file field, whatever its `thumbs` list says.
const thumbnailSize = '100x100'

/**
What one column shows for one record.
*/
export function listCell(column: Column, record: RecordModel, context: CellContext): Cell {
	const { field } = column
	if (!field) {
		const { status } = context.model
		return status ? { kind: 'status', state: publishState(record, status, context.now) } : empty
	}

	const value: unknown = record[field.name]
	// A field the API left out, or an empty one.
	if (value === undefined || value === '' || (typeof value === 'object' && !value)) return empty

	switch (field.type) {
		case 'autodate':
		case 'date': {
			return dateCell(String(value), column.config?.widget === 'date', context.uiLocale)
		}
		case 'bool': {
			const badge = column.config?.badge
			if (badge === undefined) return text(value ? m.list_yes() : m.list_no())
			return value ? { badge: resolveLabel(badge, context.uiLocale, column.label), kind: 'badge' } : empty
		}
		case 'editor': {
			// Parsed without running anything in it; only the text is kept.
			const body = new DOMParser().parseFromString(String(value).replaceAll('<', ' <'), 'text/html').body
			return text(shorten(body.textContent.replaceAll(/\s+/g, ' ').trim()))
		}
		case 'file': {
			return files(record, listOf(value), context)
		}
		case 'relation': {
			return relationCell(column, record, context)
		}
		case 'select': {
			const options = column.config?.options
			return text(
				listOf(value)
					.map(option => resolveLabel(options?.[option], context.uiLocale, option))
					.join(', '),
			)
		}
		case 'url': {
			const href = String(value)
			return /^https?:\/\//i.test(href) ? { href, kind: 'link' } : text(href)
		}
		default: {
			return text(shorten(typeof value === 'object' ? JSON.stringify(value) : String(value)))
		}
	}
}

/**
The name of a record, as plain text; empty when it has none.
*/
export function recordTitle(record: RecordModel, { model }: CellContext): string {
	const value: unknown = model.titleField === undefined ? undefined : record[model.titleField]
	return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function dateCell(value: string, isDateOnly: boolean, uiLocale: string): Cell {
	const date = parseDate(value)
	if (Number.isNaN(date.getTime())) return text(value)
	// A day without a time is stored as midnight UTC and must stay that day in every time zone.
	const format: Intl.DateTimeFormatOptions = isDateOnly
		? { dateStyle: 'medium', timeZone: 'UTC' }
		: { dateStyle: 'medium', timeStyle: 'short' }
	return { dateTime: date.toISOString(), kind: 'date', text: new Intl.DateTimeFormat(uiLocale, format).format(date) }
}

function files(record: RecordModel, names: string[], context: CellContext): Cell {
	if (names.length === 0) return empty
	return {
		files: names.map(name => ({
			name,
			thumbnail: imageName.test(name)
				? context.pb.files.getURL(record, name, { thumb: thumbnailSize, token: context.fileToken })
				: undefined,
		})),
		kind: 'files',
	}
}

/**
A single or multiple value as a list.
*/
function listOf(value: unknown): string[] {
	return (Array.isArray(value) ? value : [value]).filter(item => item !== '').map(String)
}

/**
Related records are shown by name; a record of the media library by its image. One that PocketBase
did not expand (its view rule refuses the editor) is shown by its id.
*/
function relationCell(column: Column, record: RecordModel, context: CellContext): Cell {
	const expanded: unknown = record.expand?.[column.field!.name]
	const related = (Array.isArray(expanded) ? expanded : expanded ? [expanded] : []) as RecordModel[]
	if (related.length === 0) {
		const ids = listOf(record[column.field!.name])
		return ids.length > 0 ? text(ids.join(', ')) : empty
	}

	const { media } = context.config
	if (media && related.every(item => item.collectionName === media.collection)) {
		const images = related.flatMap(item => listOf(item[media.fileField] ?? '').map(name => ({ item, name })))
		if (images.length > 0 && images.every(({ name }) => imageName.test(name))) {
			return {
				files: images.map(({ item, name }) => ({
					name: String((media.altField && item[media.altField]) || name),
					thumbnail: context.pb.files.getURL(item, name, { thumb: thumbnailSize, token: context.fileToken }),
				})),
				kind: 'files',
			}
		}
	}

	const { config, schema } = context
	const name = (item: RecordModel) => {
		const target = schema.find(collection => collection.name === item.collectionName)
		return recordName(item, nameKeys(config, target, column.config?.displayField), config.locales?.[0])
	}
	return text(related.map(item => name(item)).join(', '))
}

function shorten(value: string): string {
	const characters = [...value]
	return characters.length > 120 ? `${characters.slice(0, 120).join('')}…` : value
}

function text(value: string): Cell {
	return value === '' ? empty : { kind: 'text', text: value }
}
