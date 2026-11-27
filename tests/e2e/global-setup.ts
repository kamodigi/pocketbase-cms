import type { FullConfig } from '@playwright/test'

import { existsSync } from 'node:fs'

import { startPocketBase } from '../pocketbase'

// Serves the built CMS the way a site does: build/ in pb_public/cms/ next to the site's config.json.
// Password reset emails are kept for the tests to read instead of being sent.
export default async function globalSetup(config: FullConfig) {
	if (!existsSync('build/index.html')) throw new Error('build/ is missing. Run `pnpm build` before the E2E tests.')

	const baseURL = config.projects[0].use.baseURL
	const server = await startPocketBase({
		hooks: { 'test_capture_mail.pb.js': 'tests/e2e/fixtures/capture-mail.pb.js' },
		port: Number(new URL(baseURL!).port),
		public: { cms: 'build', 'cms/config.json': 'examples/lantern-coffee/cms.config.json' },
	})
	return server.stop
}
