import PocketBase from 'pocketbase'
import { inject } from 'vitest'

import { devAccounts } from '../pocketbase'

// A 1x1 transparent PNG.
const png = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
	character => character.codePointAt(0)!,
)

// Each client takes the PocketBase to talk to; the default is the one shared by the whole run.

export function anonymous(url = inject('pocketbaseUrl')): PocketBase {
	const pb = new PocketBase(url)
	// Tests send requests in parallel; the SDK would otherwise cancel duplicates.
	pb.autoCancellation(false)
	return pb
}

export async function asEditor(url?: string): Promise<PocketBase> {
	const pb = anonymous(url)
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

export async function asSuperuser(url?: string): Promise<PocketBase> {
	const pb = anonymous(url)
	await pb.collection('_superusers').authWithPassword(devAccounts.superuser.email, devAccounts.superuser.password)
	return pb
}

/**
A form for the media collection with a 1x1 PNG, named `filename`.
*/
export function mediaForm(alt: string, filename = 'pixel.png'): FormData {
	const form = new FormData()
	form.append('file', new Blob([png], { type: 'image/png' }), filename)
	form.append('alt', alt)
	return form
}

/**
Lowercase and digits only, so it also fits the posts slug pattern.
*/
export function uniqueId(): string {
	return `t${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}
