import type { AssetPath } from '$app/types'

import { asset } from '$app/paths'

/**
Resolves a brand.logo / brand.favicon value: absolute URLs and root paths are kept, anything else is
relative to the CMS folder, next to index.html (in pb_public/cms/, "logo.svg" is /cms/logo.svg).
*/
export function brandAssetUrl(path: string): string {
	return /^([a-z][\d+.a-z-]*:|\/)/i.test(path) ? path : asset(path as AssetPath)
}
