import { error } from '@sveltejs/kit'

import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, parent }) => {
	const { cms } = await parent()
	if (cms && !Object.hasOwn(cms.collections, params.collection)) error(404, `Unknown collection "${params.collection}"`)
}
