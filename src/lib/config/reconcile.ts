import type { CmsConfig, CollectionConfig } from './types'

import { type ConfigIssue, issue } from './issues'
import { localizedFieldName } from './localize'
import { statusColumn } from './types'

export interface ReconcileResult {
	/**
	A copy of the config with every reference to a missing collection or field removed.
	*/
	config: CmsConfig
	/**
	One entry per removed reference, to show at the top of the screen.
	*/
	warnings: ConfigIssue[]
}

/**
The part of a PocketBase collection definition that the config is checked against.
*/
export interface SchemaCollection {
	fields: SchemaField[]
	name: string
}

export interface SchemaField {
	name: string
	type: string
}

/**
Compares a valid config with the PocketBase schema (decision 42). Anything the config names that the
schema does not have is reported as a warning and dropped, so the rest of the CMS can assume that
every collection and field in the config exists.
*/
export function reconcileConfig(source: CmsConfig, schema: SchemaCollection[]): ReconcileResult {
	const config = structuredClone(source)
	const warnings: ConfigIssue[] = []
	const schemaByName = new Map(schema.map(c => [c.name, c]))

	for (const [name, collection] of Object.entries(config.collections)) {
		const schemaCollection = schemaByName.get(name)
		if (schemaCollection) {
			reconcileCollection(config, name, collection, schemaCollection, warnings)
		} else {
			warnings.push(issue(['collections', name], `the PocketBase schema has no collection "${name}"; ignored`))
			delete config.collections[name]
		}
	}

	if (config.nav) {
		config.nav = config.nav
			.map(group => ({ ...group, items: group.items.filter(item => Object.hasOwn(config.collections, item)) }))
			.filter(group => group.items.length > 0)
	}

	if (config.media) {
		const mediaSchema = schemaByName.get(config.media.collection)
		if (mediaSchema && Object.hasOwn(config.collections, config.media.collection)) {
			reconcileMedia(config, mediaSchema, warnings)
		} else {
			warnings.push(
				issue(['media', 'collection'], `"${config.media.collection}" is not available; media library disabled`),
			)
			delete config.media
		}
	}

	return { config, warnings }
}

function fieldNameSet(collection: SchemaCollection): Set<string> {
	return new Set(collection.fields.map(f => f.name))
}

/**
Filters a list of field names; returns undefined when nothing is left, so defaults apply.
*/
function keepExisting(
	names: string[] | undefined,
	path: (number | string)[],
	hasField: (field: string) => boolean,
	missing: (path: (number | string)[], field: string) => void,
): string[] | undefined {
	if (names === undefined) return undefined
	const kept = names.filter((field, index) => {
		if (hasField(field)) return true
		missing([...path, index], field)
		return false
	})
	return kept.length > 0 ? kept : undefined
}

/**
Terms of a PocketBase sort expression such as "-published_at,+title,author.name". Special terms such
as "@random" come back as they are.
*/
function parseSort(sort: string): { direction: string; field: string }[] {
	return sort
		.split(',')
		.map(part => part.trim())
		.filter(part => part !== '')
		.map(part => {
			const direction = /^[+-]/.test(part) ? part.charAt(0) : ''
			return { direction, field: part.slice(direction.length) }
		})
}

function quoteList(names: string[]): string {
	return names.map(n => `"${n}"`).join(', ')
}

function reconcileCollection(
	config: CmsConfig,
	name: string,
	collection: CollectionConfig,
	schemaCollection: SchemaCollection,
	warnings: ConfigIssue[],
): void {
	const at = ['collections', name]
	const schemaFields = fieldNameSet(schemaCollection)
	const locales = config.locales ?? []
	const missing = (path: (number | string)[], field: string) => {
		warnings.push(issue(path, `the PocketBase collection "${name}" has no field "${field}"; ignored`))
	}

	// Field settings first: whether a localized base name exists decides how the other references resolve.
	const localized = new Set<string>()
	const fieldConfigs = Object.entries(collection.fields ?? {})
	for (const [field, fieldConfig] of fieldConfigs) {
		const path = [...at, 'fields', field]
		if (fieldConfig.localized) {
			const variants = locales.map(locale => localizedFieldName(field, locale))
			const absent = variants.filter(v => !schemaFields.has(v))
			if (absent.length === variants.length) {
				warnings.push(issue(path, `the PocketBase collection "${name}" has none of ${quoteList(variants)}; ignored`))
				delete collection.fields?.[field]
				continue
			}
			if (absent.length > 0) {
				warnings.push(issue(path, `the PocketBase collection "${name}" has no ${quoteList(absent)}`))
			}
			localized.add(field)
		} else if (!schemaFields.has(field)) {
			missing(path, field)
			delete collection.fields?.[field]
		}
	}

	const hasField = (field: string) => schemaFields.has(field) || localized.has(field)

	const remainingFieldConfigs = Object.entries(collection.fields ?? {})
	for (const [field, fieldConfig] of remainingFieldConfigs) {
		if (fieldConfig.slugFrom === undefined || hasField(fieldConfig.slugFrom)) {
			continue
		}

		missing([...at, 'fields', field, 'slugFrom'], fieldConfig.slugFrom)
		delete fieldConfig.slugFrom
	}

	if (collection.titleField !== undefined && !hasField(collection.titleField)) {
		missing([...at, 'titleField'], collection.titleField)
		delete collection.titleField
	}

	if (collection.status) {
		const status = collection.status
		const key = status.draftField === undefined ? 'publishedField' : 'draftField'
		const flag = status.draftField ?? status.publishedField
		if (hasField(flag)) {
			if (status.publishedAtField !== undefined && !hasField(status.publishedAtField)) {
				missing([...at, 'status', 'publishedAtField'], status.publishedAtField)
				delete status.publishedAtField
			}
		} else {
			missing([...at, 'status', key], flag)
			delete collection.status
		}
	}

	const list = collection.list
	if (list) {
		const hasColumn = (field: string) => (field === statusColumn ? collection.status !== undefined : hasField(field))
		const missingColumn = (path: (number | string)[], field: string) => {
			if (field === statusColumn)
				warnings.push(issue(path, `"${statusColumn}" needs "status", which was removed; ignored`))
			else missing(path, field)
		}
		list.columns = keepExisting(list.columns, [...at, 'list', 'columns'], hasColumn, missingColumn)
		if (list.columns === undefined) delete list.columns
		list.search = keepExisting(list.search, [...at, 'list', 'search'], hasField, missing)
		if (list.search === undefined) delete list.search
		if (list.sort !== undefined) {
			// A localized base name sorts by the base locale's field, the value the list shows (decision 34).
			const baseLocale = locales[0]
			const sortField = (field: string) =>
				baseLocale && localized.has(field) ? localizedFieldName(field, baseLocale) : field
			const terms = parseSort(list.sort)
			const absent = terms
				.map(t => t.field)
				.filter(field => !field.startsWith('@') && !hasField(field.split('.', 1)[0] ?? field))
			if (absent.length > 0) {
				warnings.push(
					issue(
						[...at, 'list', 'sort'],
						`the PocketBase collection "${name}" has no ${quoteList(absent)}; sort ignored`,
					),
				)
				delete list.sort
			} else {
				list.sort = terms.map(t => t.direction + (t.field.includes('.') ? t.field : sortField(t.field))).join(',')
			}
		}
	}

	if (collection.form) {
		for (const area of ['main', 'side'] as const) {
			const kept = keepExisting(collection.form[area], [...at, 'form', area], hasField, missing)
			if (kept === undefined) delete collection.form[area]
			else collection.form[area] = kept
		}
	}
}

function reconcileMedia(config: CmsConfig, schemaCollection: SchemaCollection, warnings: ConfigIssue[]): void {
	const media = config.media
	if (!media) return
	const schemaFields = fieldNameSet(schemaCollection)
	const name = media.collection
	if (!schemaFields.has(media.fileField)) {
		warnings.push(
			issue(
				['media', 'fileField'],
				`the PocketBase collection "${name}" has no field "${media.fileField}"; media library disabled`,
			),
		)
		delete config.media
		return
	}
	for (const key of ['altField', 'captionField', 'widthField', 'heightField', 'mimeField'] as const) {
		const field = media[key]
		if (field === undefined || schemaFields.has(field)) {
			continue
		}

		warnings.push(issue(['media', key], `the PocketBase collection "${name}" has no field "${field}"; ignored`))
		delete media[key]
	}
}
