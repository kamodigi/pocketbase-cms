import type PocketBase from 'pocketbase'
import type { ListResult, RecordModel } from 'pocketbase'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import { buildListModel, type Column, type ListModel, normalizeListQuery } from './model'
import { type ListQuery, parseListQuery } from './query'
import { listFilter, listSort } from './request'

export interface RecordList {
	/**
	Set when a column shows protected files.
	*/
	fileToken?: string
	model: ListModel
	query: ListQuery
	result: ListResult<RecordModel>
}

/**
Fetches the page of records that the URL hash asks for. `name` is a collection of both the reconciled
config and the schema.
*/
export async function loadRecordList(
	pb: PocketBase,
	config: CmsConfig,
	schema: SchemaCollection[],
	{ hash, name, uiLocale }: { hash: string; name: string; uiLocale: string },
): Promise<RecordList> {
	const model = buildListModel(
		config,
		schema.find(collection => collection.name === name)!,
		uiLocale,
	)
	const query = normalizeListQuery(parseListQuery(hash), model)
	const relations = model.columns.filter(column => column.field?.type === 'relation')
	const result = await pb.collection(name).getList(query.page, model.perPage, {
		expand: relations.map(column => column.field!.name).join(','),
		filter: listFilter(pb, model, query),
		sort: listSort(model, query),
	})
	const fileToken = isFileTokenNeeded(model.columns, config, schema) ? await pb.files.getToken() : undefined
	return { fileToken, model, query, result }
}

/**
Whether the list can show a protected file: in a file column, or an image of the media library
reached through a relation.
*/
function isFileTokenNeeded(columns: Column[], { media }: CmsConfig, schema: SchemaCollection[]): boolean {
	const isMediaProtected = schema
		.find(collection => collection.name === media?.collection)
		?.fields.some(field => field.name === media?.fileField && field.protected)
	return columns.some(
		({ field }) => (field?.type === 'file' && field.protected) || (field?.type === 'relation' && isMediaProtected),
	)
}
