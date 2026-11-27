import { resolve } from '$app/paths'
import { error, redirect } from '@sveltejs/kit'
import { ClientResponseError } from 'pocketbase'

import { signOut } from '#lib/auth/auth.js'
import { loadRecordList, type RecordList } from '#lib/list/load.js'
import { serializeListQuery } from '#lib/list/query.js'
import { pb } from '#lib/pocketbase.js'
import { getLocale } from '#paraglide/runtime.js'

import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, parent, url }): Promise<{ list?: RecordList }> => {
	const { cms, schema } = await parent()
	// The root layout shows the config errors in place of every screen.
	if (!cms) return {}
	const name = params.collection
	if (!Object.hasOwn(cms.collections, name)) error(404, `Unknown collection "${name}"`)

	// A single page has no list: go straight to its record (decision 14).
	if (cms.collections[name].singleton) {
		const hasCreated = schema.find(c => c.name === name)?.fields.some(field => field.name === 'created')
		const sort = hasCreated ? 'created' : 'id'
		let id: string | undefined
		try {
			const { items } = await pb.collection(name).getList(1, 1, { skipTotal: true, sort })
			id = items[0]?.id
		} catch (error_) {
			requestFailed(error_)
		}
		if (id !== undefined) {
			redirect(307, resolve('/(app)/collections/[collection]/[id]', { collection: name, id }))
		}
		return {}
	}

	let list: RecordList
	try {
		list = await loadRecordList(pb, cms, schema, { hash: url.hash, name, uiLocale: getLocale() })
	} catch (error_) {
		requestFailed(error_)
	}
	// Past the end, for example after the last record of the last page was deleted.
	const lastPage = Math.max(list.result.totalPages, 1)
	if (list.query.page > lastPage) {
		const query = serializeListQuery({ ...list.query, page: lastPage })
		redirect(307, `${resolve('/(app)/collections/[collection]', { collection: name })}${query}`)
	}
	return { list }
}

function requestFailed(failure: unknown): never {
	if (!(failure instanceof ClientResponseError)) throw failure
	// The token was refused: the session expired or the account was deleted.
	if (failure.status === 401) {
		signOut(pb)
		redirect(307, resolve('/(auth)/login'))
	}
	// Status 0 is a network failure.
	error(failure.status >= 400 ? failure.status : 503, failure.message)
}
