import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineConfig } from 'vitest/config'

import { configValidator } from './tools/config-validator.ts'

export default defineConfig({
	plugins: [
		configValidator(),
		sveltekit({
			// The CMS is a static SPA copied into PocketBase's pb_public (e.g. pb_public/cms/).
			adapter: adapter(),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
			},
			// Served from pb_public/cms/. Hash-based routes mean reloading a deep link only ever
			// asks PocketBase for /cms/index.html, which it has.
			paths: { base: '/cms' },
			router: { type: 'hash' },
			// The build changes only when PocketBase is redeployed; no need to poll for new versions.
			version: { pollInterval: 0 },
		}),
		svelteTesting(),
	],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['./vitest-setup.ts'],
	},
})
