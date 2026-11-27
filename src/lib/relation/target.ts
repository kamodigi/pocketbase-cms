import {
	type CmsConfig,
	type FieldConfig,
	localizedFieldName,
	type SchemaCollection,
	type SchemaField,
} from '#lib/config/index.js'
import { buildListModel } from '#lib/list/model.js'

import { nameKeys } from './name'

/**
Where a relation field's records are, and how the picker shows, searches and orders them.
*/
export interface RelationTarget {
	baseLocale?: string
	/**
	The related collection's name, or its id when it is outside the CMS; PocketBase takes both.
	*/
	collection: string
	/**
	The order of the records to choose from, as a PocketBase sort expression; empty for the id order.
	*/
	defaultSort: string
	/**
	The fields that name a record, best first.
	*/
	nameKeys: string[]
	/**
	PocketBase fields the search box matches. Undefined for a collection outside the CMS, whose fields
	are only known from its records.
	*/
	searchFields?: string[]
}

/**
The target of a relation field. `collections` is the schema of the CMS's collections.
*/
export function relationTarget(
	config: CmsConfig,
	field: SchemaField,
	fieldConfig: FieldConfig | undefined,
	collections: SchemaCollection[],
	uiLocale: string,
): RelationTarget {
	const target = collections.find(item => item.id !== undefined && item.id === field.collectionId)
	const keys = nameKeys(config, target, fieldConfig?.displayField)
	const baseLocale = config.locales?.[0]
	if (!target) {
		return { baseLocale, collection: field.collectionId ?? '', defaultSort: '', nameKeys: keys }
	}

	const list = buildListModel(config, target, uiLocale)
	const names = new Set(target.fields.map(item => item.name))
	// The field the user reads in the picker is searched, along with what the collection's list searches.
	const resolve = (key: string): string[] => {
		if (names.has(key)) return [key]
		const localized = baseLocale && localizedFieldName(key, baseLocale)
		return localized && names.has(localized) ? [localized] : []
	}
	const shown = keys.flatMap(key => resolve(key)).slice(0, 1)
	const searchFields = [...new Set([...shown, ...list.searchFields])]
	return {
		baseLocale,
		collection: target.name,
		defaultSort: list.defaultSort,
		nameKeys: keys,
		searchFields: searchFields.length > 0 ? searchFields : ['id'],
	}
}
