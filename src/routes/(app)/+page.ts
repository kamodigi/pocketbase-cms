import { resolve } from '$app/paths'
import { redirect } from '@sveltejs/kit'

import { firstCollection } from '#lib/nav/build-nav.js'

import type { PageLoad } from './$types'

// The start screen is the first collection in the sidebar.
export const load: PageLoad = async ({ parent }) => {
	const { cms } = await parent()
	const collection = cms ? firstCollection(cms) : undefined
	if (collection) redirect(307, resolve('/(app)/collections/[collection]', { collection }))
}
