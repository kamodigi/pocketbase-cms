import type { AssetPath } from '$app/types'

import { asset } from '$app/paths'

/**
Resolves a brand.logo / brand.favicon value: absolute URLs and root paths are kept, anything else is
relative to the CMS folder (so "logo.svg" is /cms/logo.svg, next to index.html).
*/
export function brandAssetUrl(path: string): string {
	return /^([a-z][\d+.a-z-]*:|\/)/i.test(path) ? path : asset(path as AssetPath)
}
