import {
	type CmsConfig,
	type FieldConfig,
	localizedFieldName,
	resolveLabel,
	type SchemaCollection,
	type SchemaField,
} from '#lib/config/index.js'
import { titleFieldName } from '#lib/list/model.js'
import { m } from '#paraglide/messages.js'

export interface FormField {
	config?: FieldConfig
	field: SchemaField
	help?: string
	kind: InputKind
	label: string
	/**
	The PocketBase field name, which is also the key of its value.
	*/
	name: string
	/**
	For select and checkboxes: the stored values with their labels.
	*/
	options: { label: string; value: string }[]
	/**
	Shown but not editable: `readonly` in the config, or an autodate.
	*/
	readonly: boolean
	/**
	For slugs: the PocketBase field a slug is suggested from.
	*/
	slugFrom?: string
}

export interface FormModel {
	/**
	Fields the CMS fills on create without showing them (decision: `autofill` in the JSON Schema).
	*/
	autofill: { kind: 'currentUser' | 'now'; name: string }[]
	main: FormField[]
	side: FormField[]
	/**
	The PocketBase field that names a record.
	*/
	titleField?: string
}

/**
The input a field gets. `pending` is a type whose input comes in a later version (relation, file);
its value is shown nowhere and never sent.
*/
export type InputKind =
	| 'autodate'
	| 'checkboxes'
	| 'date'
	| 'datetime'
	| 'number'
	| 'pending'
	| 'select'
	| 'slug'
	| 'text'
	| 'textarea'
	| 'toggle'
	| 'url'

/**
The id in `#/collections/<name>/new`, the screen that creates a record. PocketBase ids are 15
characters by default, so it does not name a record.
*/
export const newRecordId = 'new'

// Types the CMS has no input for (decision 10). Fields of these types are left out of the form.
const supportedTypes = new Set([
	'autodate',
	'bool',
	'date',
	'editor',
	'file',
	'number',
	'relation',
	'select',
	'text',
	'url',
])

const timestampLabels = new Map([
	['created', () => m.list_column_created()],
	['updated', () => m.list_column_updated()],
])

/**
The edit form of one collection, from the reconciled config and the schema.
*/
export function buildFormModel(config: CmsConfig, schema: SchemaCollection, uiLocale: string): FormModel {
	const collection = config.collections[schema.name] ?? {}
	const fieldConfigs = collection.fields ?? {}
	const fields = new Map(schema.fields.map(field => [field.name, field]))
	const locales = config.locales ?? []

	// The config's key for each PocketBase field: a localized base name stands for all its locales.
	const configKeyOf = new Map<string, string>()
	const expand = (key: string): string[] => {
		if (fieldConfigs[key]?.localized && locales.length > 0) {
			const names = locales.map(locale => localizedFieldName(key, locale)).filter(name => fields.has(name))
			for (const name of names) configKeyOf.set(name, key)
			return names
		}
		return fields.has(key) ? [key] : []
	}
	for (const key of Object.keys(fieldConfigs)) expand(key)
	const resolveName = (key: string | undefined): string | undefined => (key === undefined ? undefined : expand(key)[0])

	const autofill: FormModel['autofill'] = []
	const isShown = (field: SchemaField): boolean => {
		const fieldConfig = fieldConfigs[configKeyOf.get(field.name) ?? field.name]
		const isLeftOut = field.primaryKey || field.name === 'id' || field.hidden || fieldConfig?.hidden
		// An autofill field is filled on create and not shown.
		return !isLeftOut && fieldConfig?.autofill === undefined && supportedTypes.has(field.type)
	}
	for (const field of schema.fields) {
		const kind = fieldConfigs[configKeyOf.get(field.name) ?? field.name]?.autofill
		if (kind && !field.primaryKey) autofill.push({ kind, name: field.name })
	}

	const toField = (name: string): FormField[] => {
		const field = fields.get(name)
		if (!field || !isShown(field)) return []
		const key = configKeyOf.get(name) ?? name
		const fieldConfig = fieldConfigs[key]
		const baseLabel = resolveLabel(fieldConfig?.label, uiLocale, timestampLabels.get(name)?.() ?? key)
		const locale = locales.find(item => localizedFieldName(key, item) === name)
		const label = key === name ? baseLabel : `${baseLabel} (${locale})`
		const kind = inputKind(field, fieldConfig)
		return [
			{
				config: fieldConfig,
				field,
				help: fieldConfig?.help === undefined ? undefined : resolveLabel(fieldConfig.help, uiLocale, ''),
				kind,
				label,
				name,
				options: (field.values ?? []).map(value => ({
					label: resolveLabel(fieldConfig?.options?.[value], uiLocale, value),
					value,
				})),
				readonly: kind === 'autodate' || Boolean(fieldConfig?.readonly),
				slugFrom: kind === 'slug' ? resolveName(fieldConfig?.slugFrom) : undefined,
			},
		]
	}

	const placed = new Set<string>()
	const place = (keys: string[] | undefined): FormField[] => {
		const names = (keys ?? []).flatMap(key => expand(key)).filter(name => !placed.has(name))
		for (const name of names) placed.add(name)
		return [...new Set(names)].flatMap(name => toField(name))
	}
	const main = place(collection.form?.main)
	const side = place(collection.form?.side)
	// The rest goes to the end of main, except the timestamps, which are only shown and go to the side.
	for (const field of schema.fields) {
		if (placed.has(field.name)) continue
		;(field.type === 'autodate' ? side : main).push(...toField(field.name))
	}

	return { autofill, main, side, titleField: resolveName(titleFieldName(config, schema)) }
}

/**
The input for a field: the config's `widget` where it fits the PocketBase type, else the type's own.
*/
export function inputKind(field: SchemaField, config: FieldConfig | undefined): InputKind {
	const widget = config?.widget
	switch (field.type) {
		case 'autodate': {
			return 'autodate'
		}
		case 'bool': {
			return 'toggle'
		}
		case 'date': {
			return widget === 'date' ? 'date' : 'datetime'
		}
		case 'editor': {
			// Raw HTML until the rich text editor arrives; PocketBase sanitizes it on save (decision 11).
			return 'textarea'
		}
		case 'number': {
			return 'number'
		}
		case 'select': {
			// The value is a list or a single string, so the PocketBase field decides, not `widget`.
			return isMultiple(field) ? 'checkboxes' : 'select'
		}
		case 'text': {
			if (widget === 'slug' || widget === 'textarea') return widget
			return config?.slugFrom === undefined ? 'text' : 'slug'
		}
		case 'url': {
			return 'url'
		}
		default: {
			return 'pending'
		}
	}
}

/**
Whether a select field holds a list of values.
*/
export function isMultiple(field: SchemaField): boolean {
	return (field.maxSelect ?? 1) > 1
}
