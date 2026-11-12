import { defineConfig, devices } from '@playwright/test'

// tests/e2e/global-setup.ts serves build/ from a real PocketBase on this port. Run `pnpm build` first.
const port = Number(process.env.E2E_PORT ?? 8091)

export default defineConfig({
	forbidOnly: !!process.env.CI,
	globalSetup: './tests/e2e/global-setup.ts',
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	retries: process.env.CI ? 1 : 0,
	testDir: './tests/e2e',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		locale: 'en-US',
		trace: 'retain-on-failure',
	},
})
