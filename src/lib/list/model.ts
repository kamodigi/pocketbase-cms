import {
	type CmsConfig,
	type FieldConfig,
	localizedFieldName,
	resolveLabel,
	type SchemaCollection,
	type SchemaField,
	statusColumn,
	type StatusConfig,
} from '#lib/config/index.js'
import { m } from '#paraglide/messages.js'

import { type ListQuery, type PublishState, publishStates } from './query'

export interface Column {
	/**
	The field's settings in the config.
	*/
	config?: FieldConfig
	/**
	The PocketBase field holding the value; undefined for the status column.
	*/
	field?: SchemaField
	/**
	The name in `list.columns`: a field, a localized base name or `$status`.
	*/
	key: string
	label: string
}

export interface ListModel {
	columns: Column[]
	/**
	The order without a choice by the user, as a PocketBase sort expression.
	*/
	defaultSort: string
	perPage: number
	/**
	PocketBase fields the search box matches; empty when there is nothing to search.
	*/
	searchFields: string[]
	status?: StatusConfig
	/**
	The PocketBase field that names a record.
	*/
	titleField?: string
}

const defaultPerPage = 30

const timestampLabels = new Map([
	['created', () => m.list_column_created()],
	['updated', () => m.list_column_updated()],
])

/**
What the list screen of one collection shows, from the reconciled config and the schema.
*/
export function buildListModel(config: CmsConfig, schema: SchemaCollection, uiLocale: string): ListModel {
	const collection = config.collections[schema.name] ?? {}
	const fields = new Map(schema.fields.map(field => [field.name, field]))

	// A localized base name stands for the base locale's field, the value the list shows (decision 34).
	const resolveField = (name: string): SchemaField | undefined => {
		const baseLocale = config.locales?.[0]
		const isLocalized = collection.fields?.[name]?.localized && baseLocale
		return fields.get(isLocalized ? localizedFieldName(name, baseLocale) : name)
	}

	const titleKey = titleFieldName(config, schema)
	const titleField = titleKey === undefined ? undefined : resolveField(titleKey)?.name

	const toColumn = (key: string): Column[] => {
		if (key === statusColumn) return [{ key, label: m.list_column_status() }]
		const field = resolveField(key)
		if (!field) return []
		const fieldConfig = collection.fields?.[key]
		const fallback = timestampLabels.get(key)?.() ?? key
		return [{ config: fieldConfig, field, key, label: resolveLabel(fieldConfig?.label, uiLocale, fallback) }]
	}

	// Without list.columns: the title, the publish state and the last change (decision 41).
	const defaultColumns = [titleKey, collection.status && statusColumn, 'updated'].filter(key => key !== undefined)
	let columns = [...new Set(collection.list?.columns ?? defaultColumns)].flatMap(key => toColumn(key))
	if (columns.length === 0) columns = toColumn('id')

	const searchKeys = collection.list?.search ?? (titleKey === undefined ? [] : [titleKey])
	const newestFirst = ['updated', 'created'].find(name => fields.has(name))

	return {
		columns,
		defaultSort: collection.list?.sort ?? (newestFirst ? `-${newestFirst}` : ''),
		perPage: collection.list?.perPage ?? defaultPerPage,
		searchFields: searchKeys.flatMap(key => resolveField(key)?.name ?? []),
		status: collection.status,
		titleField,
	}
}

export function isDateColumn(column: Column): boolean {
	return column.field?.type === 'date' || column.field?.type === 'autodate'
}

/**
Drops a publish state or a sort that this list does not offer, such as one typed into the URL.
*/
export function normalizeListQuery(query: ListQuery, model: ListModel): ListQuery {
	const states = offeredStates(model)
	const sorts = model.columns.flatMap(column =>
		isDateColumn(column) ? [column.field!.name, `-${column.field!.name}`] : [],
	)
	return {
		...query,
		sort: sorts.includes(query.sort) ? query.sort : '',
		status: query.status !== '' && states.includes(query.status) ? query.status : '',
	}
}

/**
The publish states the filter offers: none without `status`, "scheduled" only with a publish date.
*/
export function offeredStates({ status }: ListModel): PublishState[] {
	return status ? publishStates.filter(state => state !== 'scheduled' || status.publishedAtField !== undefined) : []
}

/**
The `titleField` of a collection, or its first text field. May be a localized base name.
*/
export function titleFieldName(config: CmsConfig, schema: SchemaCollection): string | undefined {
	const firstText = () => schema.fields.find(f => f.type === 'text' && !f.primaryKey && f.name !== 'id')?.name
	return config.collections[schema.name]?.titleField ?? firstText()
}
