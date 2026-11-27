import type PocketBase from 'pocketbase'
import type { ListResult, RecordModel } from 'pocketbase'

import { localizedFieldName } from '#lib/config/localize.js'
import { listFilter, listSort } from '#lib/list/request.js'

import type { RelationTarget } from './target'

export const pickerPageSize = 20

// Keeps the filter, which goes in the URL, short.
const idsPerRequest = 50

// Without a request key the SDK cancels the earlier of two requests to one collection, such as two
// fields naming their records at once.
// eslint-disable-next-line unicorn/no-null -- the SDK's way to turn that off
const parallel = { requestKey: null }

/**
The records with these ids. One that is gone, or that the view rules keep from the editor, is left
out.
*/
export async function fetchChosen(pb: PocketBase, target: RelationTarget, ids: string[]): Promise<RecordModel[]> {
	const records: RecordModel[] = []
	for (let start = 0; start < ids.length; start += idsPerRequest) {
		const chunk = ids.slice(start, start + idsPerRequest)
		const filter = chunk.map(id => pb.filter('id = {:id}', { id })).join(' || ')
		const result = await pb
			.collection(target.collection)
			.getList(1, chunk.length, { filter, ...parallel, skipTotal: true })
		records.push(...result.items)
	}
	return records
}

/**
One page of the records to choose from.
*/
export async function searchRecords(
	pb: PocketBase,
	target: RelationTarget,
	{ page, search }: { page: number; search: string },
): Promise<ListResult<RecordModel>> {
	const collection = pb.collection(target.collection)
	const searchFields = search === '' ? [] : (target.searchFields ?? (await fieldsOfFirstRecord(pb, target)))
	return collection.getList(page, pickerPageSize, {
		filter: listFilter(pb, { searchFields }, { search, status: '' }),
		...parallel,
		sort: listSort(target, { sort: '' }),
	})
}

/**
For a collection outside the CMS: the name fields its records have, since PocketBase refuses a filter
on a field that is not there.
*/
async function fieldsOfFirstRecord(pb: PocketBase, target: RelationTarget): Promise<string[]> {
	const { items } = await pb.collection(target.collection).getList(1, 1, { ...parallel, skipTotal: true })
	const sample = items[0] ?? {}
	const { baseLocale } = target
	const fields = target.nameKeys.flatMap(key => {
		if (Object.hasOwn(sample, key)) return [key]
		const localized = baseLocale && localizedFieldName(key, baseLocale)
		return localized && Object.hasOwn(sample, localized) ? [localized] : []
	})
	return fields.length > 0 ? fields : ['id']
}
