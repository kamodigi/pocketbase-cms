import PocketBase from 'pocketbase'
import { inject } from 'vitest'

import { devAccounts } from '../pocketbase'

export function anonymous(): PocketBase {
	const pb = new PocketBase(inject('pocketbaseUrl'))
	// Tests send requests in parallel; the SDK would otherwise cancel duplicates.
	pb.autoCancellation(false)
	return pb
}

export async function asEditor(): Promise<PocketBase> {
	const pb = anonymous()
	await pb.collection('users').authWithPassword(devAccounts.editor.email, devAccounts.editor.password)
	return pb
}

/**
A signed-in user without a role: someone who has an account but is not an editor.
*/
export async function asNewUser(): Promise<{ id: string; pb: PocketBase }> {
	const email = `${uniqueId()}@example.com`
	const password = 'password1234'
	const admin = await asSuperuser()
	const { id } = await admin.collection('users').create({ email, password, passwordConfirm: password, verified: true })
	const pb = anonymous()
	await pb.collection('users').authWithPassword(email, password)
	return { id, pb }
}

export async function asSuperuser(): Promise<PocketBase> {
	const pb = anonymous()
	await pb.collection('_superusers').authWithPassword(devAccounts.superuser.email, devAccounts.superuser.password)
	return pb
}

/**
Lowercase and digits only, so it also fits the posts slug pattern.
*/
export function uniqueId(): string {
	return `t${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}
