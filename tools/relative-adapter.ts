import type { Adapter } from '@sveltejs/kit'

import adapter from '@sveltejs/adapter-static'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
adapter-static, plus relative URLs in index.html, so the build works in any folder of pb_public/.

SvelteKit works out the base path at runtime for a hash-routed SPA, and the built JavaScript and CSS
refer to each other relatively, but index.html still names them from the server's root ("/_app/…")
when `paths.base` is empty. `paths.relative` does not cover that page.
*/
export function relativeAdapter(directory = 'build'): Adapter {
	const inner = adapter({ assets: directory, pages: directory })
	return {
		...inner,
		async adapt(builder) {
			await inner.adapt(builder)
			const file = path.join(directory, 'index.html')
			const { appDir } = builder.config
			await writeFile(file, relativeUrls(await readFile(file, 'utf8'), appDir))
		},
	}
}

/**
Turns the quoted "/<appDir>/…" URLs of the page into "./<appDir>/…". Throws when there are none: then
SvelteKit writes the page differently, and this step has to be looked at again.
*/
export function relativeUrls(html: string, appDir: string): string {
	const root = `"/${appDir}/`
	if (!html.includes(root)) {
		throw new Error(`index.html has no ${root}… URL to make relative. Check tools/relative-adapter.ts.`)
	}
	return html.replaceAll(root, () => `"./${appDir}/`)
}
