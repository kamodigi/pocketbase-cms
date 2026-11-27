import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

import { configValidator } from './tools/config-validator.ts'
import { relativeAdapter } from './tools/relative-adapter.ts'

export default defineConfig(({ command, isPreview, mode }) => {
	// The PocketBase from `docker compose up` (see README.md). Same-origin in production, so proxy in dev.
	const pocketbase = loadEnv(mode, '.', '').POCKETBASE_URL || 'http://127.0.0.1:8090'

	return {
		plugins: [
			configValidator(),
			tailwindcss(),
			sveltekit({
				// The CMS is a static SPA copied into a folder of PocketBase's pb_public, usually pb_public/cms/.
				adapter: relativeAdapter(),
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
				},
				// The build names no folder: it finds its files and config.json relative to index.html. The
				// dev server (and the tests) use /cms/. Hash-based routes mean reloading a deep link only
				// ever asks PocketBase for the folder's index.html, which it has.
				paths: { base: command === 'serve' && !isPreview ? '/cms' : '' },
				router: { type: 'hash' },
				// The build changes only when PocketBase is redeployed; no need to poll for new versions.
				version: { pollInterval: 0 },
			}),
			svelteTesting(),
			paraglideVitePlugin({
				outdir: './src/paraglide',
				project: './project.inlang',
				// The UI language follows the user's choice (kept in localStorage), then the browser's
				// language setting, then English. It is independent of the content-language tabs.
				strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
			}),
		],
		server: {
			proxy: {
				'/api': pocketbase,
				'/cms/config.json': pocketbase,
			},
		},
		test: {
			environment: 'jsdom',
			include: ['src/**/*.test.ts', 'hooks/**/*.test.ts', 'tests/*.test.ts'],
			setupFiles: ['./vitest-setup.ts'],
		},
	}
})
