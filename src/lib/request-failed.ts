import { resolve } from '$app/paths'
import { error, redirect } from '@sveltejs/kit'
import { ClientResponseError } from 'pocketbase'

import { signOut } from '#lib/auth/auth.js'
import { pb } from '#lib/pocketbase.js'

/**
Turns a failed PocketBase request in a load function into SvelteKit's answer: a refused token signs
out and goes to the sign-in screen, anything else is shown as an error screen.
*/
export function requestFailed(failure: unknown): never {
	if (!(failure instanceof ClientResponseError)) throw failure
	// The token was refused: the session expired or the account was deleted.
	if (failure.status === 401) {
		signOut(pb)
		redirect(307, resolve('/(auth)/login'))
	}
	// Status 0 is a network failure.
	error(failure.status >= 400 ? failure.status : 503, failure.message)
}
