import { error } from '@sveltejs/kit'

import type { PageLoad } from './$types'

// A development page for eyeballing the design system; it is not part of the shipped CMS.
export const load: PageLoad = () => {
	if (!import.meta.env.DEV) error(404, 'Not found')
}
