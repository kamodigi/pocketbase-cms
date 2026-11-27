import { expect, type Page, test } from '@playwright/test'
import PocketBase from 'pocketbase'

import { devAccounts } from '../pocketbase'

interface Mail {
	html: string
	subject: string
	to: string[]
}

const { editor } = devAccounts

async function asSuperuser(baseURL: string): Promise<PocketBase> {
	const pb = new PocketBase(baseURL)
	await pb.collection('_superusers').authWithPassword(devAccounts.superuser.email, devAccounts.superuser.password)
	return pb
}

/**
Leaves a session in the browser that PocketBase no longer accepts, as after it expired.
*/
async function keepStaleSession(page: Page) {
	await page.addInitScript(() => {
		if (sessionStorage.getItem('stale-session')) return
		sessionStorage.setItem('stale-session', 'set')
		const payload = btoa(JSON.stringify({ exp: 1, type: 'auth' }))
		const record = { collectionName: 'users', id: 'gone', role: 'editor' }
		localStorage.setItem('pocketbase_auth', JSON.stringify({ record, token: `e30.${payload}.signature` }))
	})
}

async function signIn(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email)
	await page.getByLabel('Password').fill(password)
	await page.getByRole('button', { name: 'Sign in' }).click()
}

test('an editor signs in, sees the navigation from the config, and signs out', async ({ page }) => {
	await page.goto('/cms/')
	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
	await expect(page.getByText('Lantern Coffee')).toBeVisible()

	await signIn(page, editor.email, editor.password)

	// The start screen is the first collection in the sidebar.
	await expect(page).toHaveURL(/#\/collections\/posts$/)
	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
	const nav = page.getByRole('navigation', { name: 'Main navigation' })
	await expect(nav.getByText('Content')).toBeVisible()
	await expect(nav.getByRole('link')).toHaveText(['Posts', 'Stores', 'About page', 'Media'])
	await expect(nav.getByRole('link', { name: 'Posts' })).toHaveAttribute('aria-current', 'page')
	// Only the current item is highlighted.
	await expect(nav.locator('[data-active]')).toHaveCount(1)
	await expect(page.getByText(editor.email)).toBeVisible()

	await nav.getByRole('link', { name: 'Stores' }).click()
	await expect(page).toHaveURL(/#\/collections\/stores$/)
	await expect(page.getByRole('heading', { level: 1, name: 'Stores' })).toBeVisible()
	await expect(nav.getByRole('link', { name: 'Stores' })).toHaveAttribute('aria-current', 'page')

	// The session survives a reload.
	await page.reload()
	await expect(page.getByRole('heading', { level: 1, name: 'Stores' })).toBeVisible()

	await page.getByRole('button', { name: 'Sign out' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()

	// Signed out, a screen behind sign-in sends you back to the sign-in screen.
	await page.goto('/cms/#/collections/stores')
	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
	await expect(page).toHaveURL(/#\/login$/)
})

test('on a phone, the navigation drawer closes after following a link', async ({ page }) => {
	await page.setViewportSize({ height: 800, width: 390 })
	await page.goto('/cms/#/login')
	await signIn(page, editor.email, editor.password)
	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()

	await page.getByRole('button', { name: 'Toggle navigation' }).click()
	const drawer = page.getByRole('dialog')
	await drawer.getByRole('link', { name: 'Media' }).click()

	await expect(page.getByRole('heading', { level: 1, name: 'Media' })).toBeVisible()
	await expect(drawer).toBeHidden()
})

test('a wrong password is refused', async ({ page }) => {
	await page.goto('/cms/#/login')
	await signIn(page, editor.email, 'not-the-password')

	await expect(page.getByRole('alert')).toHaveText('The email or password is wrong.')
	await expect(page.getByLabel('Password')).toHaveValue('')
	await expect(page).toHaveURL(/#\/login$/)
})

test('a user without the editor role is refused', async ({ baseURL, page }) => {
	const admin = await asSuperuser(baseURL!)
	const email = `viewer-${crypto.randomUUID()}@example.com`
	const password = 'password1234'
	await admin.collection('users').create({ email, password, passwordConfirm: password, verified: true })

	await page.goto('/cms/#/login')
	await signIn(page, email, password)

	await expect(page.getByRole('alert')).toHaveText(/This account cannot use the CMS/)
	// Not signed in: the session is not kept, so a screen behind sign-in is still closed.
	expect(await page.evaluate(() => localStorage.getItem('pocketbase_auth'))).toBeNull()
	await page.goto('/cms/#/collections/posts')
	await expect(page).toHaveURL(/#\/login$/)
})

test('an editor whose role was removed is signed out', async ({ baseURL, page }) => {
	const admin = await asSuperuser(baseURL!)
	const email = `former-editor-${crypto.randomUUID()}@example.com`
	const password = 'password1234'
	const user = await admin
		.collection('users')
		.create({ email, password, passwordConfirm: password, role: 'editor', verified: true })

	await page.goto('/cms/#/login')
	await signIn(page, email, password)
	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()

	await admin.collection('users').update(user.id, { role: '' })
	await page.reload()

	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
})

test('a password reset email is sent from the sign-in screen', async ({ baseURL, page }) => {
	await page.goto('/cms/#/login')
	await page.getByRole('link', { name: 'Forgot your password?' }).click()

	await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible()
	await page.getByLabel('Email').fill(editor.email)
	await page.getByRole('button', { name: 'Send reset link' }).click()

	await expect(page.getByRole('status')).toContainText(editor.email)

	// PocketBase sends the email in the background, after it has answered.
	const admin = await asSuperuser(baseURL!)
	await expect
		.poll(async () => {
			const mails = await admin.send<Mail[]>('/test/mails', {})
			return mails.filter(mail => mail.to.includes(editor.email))
		})
		.toEqual([expect.objectContaining({ html: expect.stringMatching(/confirm-password-reset\/[\w.-]+/) })])

	await page.getByRole('link', { name: 'Back to sign in' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
})

test('an expired session does not block signing in again', async ({ page }) => {
	await keepStaleSession(page)
	await page.goto('/cms/#/login')
	await signIn(page, editor.email, editor.password)

	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
})

test('an expired session does not block a password reset', async ({ page }) => {
	await keepStaleSession(page)
	await page.goto('/cms/#/password-reset')
	await page.getByLabel('Email').fill(editor.email)
	await page.getByRole('button', { name: 'Send reset link' }).click()

	await expect(page.getByRole('status')).toContainText(editor.email)
})
