import type PocketBase from 'pocketbase'

import type { StatusConfig } from '#lib/config/index.js'

import type { ListModel } from './model'
import type { ListQuery, PublishState } from './query'

/**
The PocketBase filter for a search and a publish state; empty when there is neither.
*/
export function listFilter(pb: PocketBase, model: ListModel, { search, status }: ListQuery): string {
	const filters: string[] = []
	if (search !== '' && model.searchFields.length > 0) {
		// PocketBase takes a value with a "%" of its own as a LIKE pattern. The pattern is written here, with
		// the typed "%", "_" and "\" escaped, so that every search is for plain text.
		const text = `%${search.replaceAll(/[%\\_]/g, String.raw`\$&`)}%`
		const matches = model.searchFields.map(field => pb.filter(`${field} ~ {:text}`, { text }))
		filters.push(`(${matches.join(' || ')})`)
	}
	if (status !== '' && model.status) filters.push(statusFilter(model.status, status))
	return filters.join(' && ')
}

/**
The order of the list: the user's choice or the default, with the id last so that records with equal
values keep their place from one page to the next.
*/
export function listSort(model: ListModel, { sort }: ListQuery): string {
	const terms = (sort || model.defaultSort).split(',').filter(term => term !== '')
	if (terms.every(term => !term.startsWith('@') && !/^[+-]?id$/.test(term))) terms.push('id')
	return terms.join(',')
}

/**
PocketBase writes dates as "2026-01-31 09:00:00.000Z".
*/
export function parseDate(value: string): Date {
	return new Date(value.replace(' ', 'T'))
}

/**
The publish state of a record, by the same rules as the filter (see `status` in the JSON Schema).
*/
export function publishState(record: Record<string, unknown>, status: StatusConfig, now: Date): PublishState {
	const [field, draftValue] = draftFlag(status)
	const flag: unknown = record[field]
	if (Boolean(flag) === draftValue) return 'draft'
	const publishedAt = status.publishedAtField === undefined ? undefined : record[status.publishedAtField]
	return typeof publishedAt === 'string' && publishedAt !== '' && parseDate(publishedAt) > now
		? 'scheduled'
		: 'published'
}

/**
The bool field that marks a draft, and the value it has on one.
*/
function draftFlag(status: StatusConfig): [string, boolean] {
	return status.draftField === undefined ? [status.publishedField, false] : [status.draftField, true]
}

function statusFilter(status: StatusConfig, state: PublishState): string {
	const [field, draftValue] = draftFlag(status)
	if (state === 'draft') return `${field} = ${draftValue}`
	const live = `${field} = ${!draftValue}`
	const at = status.publishedAtField
	if (at === undefined) return live
	return state === 'scheduled' ? `${live} && ${at} > @now` : `${live} && (${at} = "" || ${at} <= @now)`
}
