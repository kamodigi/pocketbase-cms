import type { TestProject } from 'vitest/node'

import { startPocketBase } from '../pocketbase'

declare module 'vitest' {
	export interface ProvidedContext {
		pocketbaseUrl: string
	}
}

// One PocketBase for the whole run. Tests create their own records and never rely on a clean database.
export default async function setup(project: TestProject) {
	const server = await startPocketBase()
	project.provide('pocketbaseUrl', server.url)
	return server.stop
}
