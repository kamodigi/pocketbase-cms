import { resolve } from '$app/paths'
import { redirect } from '@sveltejs/kit'

import { hasEditorSession } from '#lib/auth/auth.js'
import { pb } from '#lib/pocketbase.js'

import type { PageLoad } from './$types'

export const load: PageLoad = () => {
	if (hasEditorSession(pb)) redirect(307, resolve('/(app)'))
}
