import type PocketBase from 'pocketbase'
import type { RecordModel } from 'pocketbase'

import { ClientResponseError } from 'pocketbase'

/**
The auth collection editors sign in with, and the `role` value that lets them in (decision 4).
PocketBase's API rules are the real access control; the CMS only decides what to show.
*/
export const editorCollection = 'users'
export const editorRole = 'editor'

export type PasswordResetResult = { ok: false; reason: 'invalid-email' | 'unavailable' } | { ok: true }

export type SignInResult = { ok: false; reason: 'credentials' | 'not-editor' | 'unavailable' } | { ok: true }

/**
For requests anyone may make. The SDK would send the stored token even after it stopped working, and
PocketBase (since v0.42) answers 401 to a token it does not accept.
*/
const withoutToken = { headers: { Authorization: '' } }

/**
Whether the stored session belongs to an editor and its token has not expired. The server may still
refuse the token (a deleted account, a changed role); requests then fail with 401 or 403.
*/
export function hasEditorSession(pb: PocketBase): boolean {
	return pb.authStore.isValid && isEditor(pb.authStore.record)
}

/**
Whether a record is a `users` account with `role = "editor"`. A superuser or any other user is not.
*/
export function isEditor(record: null | RecordModel | undefined): boolean {
	return record?.collectionName === editorCollection && record['role'] === editorRole
}

/**
Asks PocketBase to email a password reset link (decision 5). PocketBase answers the same whether
the address has an account or not, so the result never tells who has one.
*/
export async function requestPasswordReset(pb: PocketBase, email: string): Promise<PasswordResetResult> {
	try {
		await pb.collection(editorCollection).requestPasswordReset(email, withoutToken)
		return { ok: true }
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof ClientResponseError && error.status === 400 ? 'invalid-email' : 'unavailable',
		}
	}
}

/**
Signs in with a `users` account. Anyone but an editor is signed out again at once.
*/
export async function signIn(pb: PocketBase, email: string, password: string): Promise<SignInResult> {
	try {
		const { record } = await pb.collection(editorCollection).authWithPassword(email, password, withoutToken)
		if (!isEditor(record)) {
			pb.authStore.clear()
			return { ok: false, reason: 'not-editor' }
		}
		return { ok: true }
	} catch (error) {
		pb.authStore.clear()
		return {
			ok: false,
			reason: error instanceof ClientResponseError && error.status === 400 ? 'credentials' : 'unavailable',
		}
	}
}

export function signOut(pb: PocketBase): void {
	pb.authStore.clear()
}
