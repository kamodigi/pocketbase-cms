import type { RecordModel } from 'pocketbase'

import { resolve } from '$app/paths'
import { error, redirect } from '@sveltejs/kit'

import { newRecordId } from '#lib/form/model.js'
import { pb } from '#lib/pocketbase.js'
import { requestFailed } from '#lib/request-failed.js'

import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, parent }): Promise<{ record?: RecordModel }> => {
	const { cms } = await parent()
	// The root layout shows the config errors in place of every screen.
	if (!cms) return {}
	const name = params.collection
	if (!Object.hasOwn(cms.collections, name)) error(404, `Unknown collection "${name}"`)

	if (params.id === newRecordId) {
		// A single page is edited, never added to: its record comes with the site's migrations.
		if (cms.collections[name].singleton) redirect(307, resolve('/(app)/collections/[collection]', { collection: name }))
		return {}
	}

	try {
		return { record: await pb.collection(name).getOne(params.id) }
	} catch (error_) {
		requestFailed(error_)
	}
}
