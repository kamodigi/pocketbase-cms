import { resolve } from '$app/paths'
import { error, redirect } from '@sveltejs/kit'
import { ClientResponseError } from 'pocketbase'

import { hasEditorSession, signOut } from '#lib/auth/auth.js'
import { type ConfigIssue, reconcileConfig, type SchemaCollection } from '#lib/config/index.js'
import { pb } from '#lib/pocketbase.js'

import type { LayoutLoad } from './$types'

interface SchemaResponse {
	collections: (SchemaCollection & { id: string; type: string })[]
}

/**
Every screen behind sign-in: only an editor gets past this (decision 4). The collection definitions
come from GET /api/cms/schema and are checked against the config (decision 42) once per sign-in.
*/
export const load: LayoutLoad = async ({ parent }) => {
	const { config } = await parent()
	// The root layout shows the config errors in place of every screen.
	if (!config.ok) return { cms: undefined, schema: [], warnings: [] as ConfigIssue[] }

	if (!hasEditorSession(pb)) {
		signOut(pb)
		redirect(307, resolve('/(auth)/login'))
	}

	let schema: SchemaResponse
	try {
		schema = await pb.send<SchemaResponse>('/api/cms/schema', {})
	} catch (error_) {
		if (!(error_ instanceof ClientResponseError)) throw error_
		// The token was refused: the account was deleted, lost the editor role, or the session expired.
		if (error_.status === 401 || error_.status === 403) {
			signOut(pb)
			redirect(307, resolve('/(auth)/login'))
		}
		// Status 0 is a network failure. The hook answers 500 when the server cannot read the config.
		error(error_.status >= 400 ? error_.status : 503, error_.message)
	}

	const { config: cms, warnings } = reconcileConfig(config.config, schema.collections)
	return { cms, schema: schema.collections, warnings }
}
