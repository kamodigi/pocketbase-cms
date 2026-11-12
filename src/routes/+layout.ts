import type { AssetPath } from '$app/types'

import { asset } from '$app/paths'

import { configUrl, loadConfig } from '#lib/config/index.js'

import type { LayoutLoad } from './$types'

// config.json is copied next to index.html at deploy time, not shipped in static/, so it is not a known
// AssetPath. asset() still gives the right absolute URL (/cms/config.json) whatever the page URL is.
export const load: LayoutLoad = async ({ fetch }) => ({
	config: await loadConfig(fetch, asset(configUrl as AssetPath)),
})
