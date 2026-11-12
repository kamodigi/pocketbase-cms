import { defineConfig } from 'vitest/config'

// Integration tests run against a real PocketBase started by tests/integration/global-setup.ts.
export default defineConfig({
	test: {
		environment: 'node',
		globalSetup: ['./tests/integration/global-setup.ts'],
		include: ['tests/integration/**/*.test.ts'],
	},
})
