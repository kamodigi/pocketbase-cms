import type { RecordModel } from 'pocketbase'

import { type CmsConfig, localizedFieldName, type SchemaCollection } from '#lib/config/index.js'
import { titleFieldName } from '#lib/list/model.js'

/**
The fields that can name a related record, best first: the relation's `displayField`, then the
related collection's title field. The collection may be outside the CMS (such as users), so common
name fields are tried too. They may be localized base names.
*/
export function nameKeys(config: CmsConfig, target: SchemaCollection | undefined, displayField?: string): string[] {
	const titleKey = target && titleFieldName(config, target)
	return [...new Set([displayField, titleKey, 'name', 'title', 'email'].filter(key => key !== undefined))]
}

/**
The name of a related record: the first of `keys` it has a value for, else its id.
*/
export function recordName(record: RecordModel, keys: string[], baseLocale: string | undefined): string {
	for (const key of keys) {
		const value: unknown = record[key] || (baseLocale && record[localizedFieldName(key, baseLocale)])
		if (typeof value === 'number' || (typeof value === 'string' && value !== '')) return String(value)
	}
	return record.id
}
