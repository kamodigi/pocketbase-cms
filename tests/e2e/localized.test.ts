// The multilingual article type of the example presets (events): one input per localized field, with
// a tab per content locale.
import { expect, type Page, test } from '@playwright/test'
import PocketBase from 'pocketbase'

import { devAccounts } from '../pocketbase'

async function asEditor(baseURL: string): Promise<PocketBase> {
	const pb = new PocketBase(baseURL)
	await pb.collection('users').authWithPassword(devAccounts.editor.email, devAccounts.editor.password)
	return pb
}

async function signIn(page: Page) {
	await page.goto('/cms/#/login')
	await page.getByLabel('Email').fill(devAccounts.editor.email)
	await page.getByLabel('Password').fill(devAccounts.editor.password)
	await page.getByRole('button', { name: 'Sign in' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
}

function uniqueTag(): string {
	return `t${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}

test('an event is written in each locale by switching tabs, and saved', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	await signIn(page)
	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Events' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible()
	await page.getByRole('link', { name: 'New' }).click()

	const titleTabs = page.getByRole('tablist', { name: 'Language of Title' })
	const bodyTabs = page.getByRole('tablist', { name: 'Language of Body' })
	await expect(titleTabs.getByRole('tab')).toHaveText(['English', 'Japanese', 'Simplified Chinese'])
	// The base locale is open first.
	await expect(titleTabs.getByRole('tab', { name: 'English' })).toHaveAttribute('aria-selected', 'true')
	const title = page.getByRole('textbox', { name: /^Title/ })
	const body = page.getByRole('textbox', { name: 'Body' })

	// Only the base locale is required in the schema: its tab is opened to show the error.
	await titleTabs.getByRole('tab', { name: 'Japanese' }).click()
	await title.fill(`カッピングの夜 ${tag}`)
	await page.getByRole('button', { name: 'Create' }).click()
	await expect(titleTabs.getByRole('tab', { name: /^English/ })).toHaveAttribute('aria-selected', 'true')
	await expect(titleTabs.getByRole('tab', { name: /^English/ })).toContainText('has an error')
	await expect(title).toBeFocused()
	await expect(title).toHaveAccessibleDescription('This field is required.')

	await title.fill(`Cupping night ${tag}`)
	await expect(page.getByRole('textbox', { name: /^Slug/ })).toHaveValue(`cupping-night-${tag}`)
	await body.fill('<p>At the pier.</p>')
	// One tab switches every localized input.
	await bodyTabs.getByRole('tab', { name: 'Simplified Chinese' }).click()
	await expect(titleTabs.getByRole('tab', { name: 'Simplified Chinese' })).toHaveAttribute('aria-selected', 'true')
	await expect(title).toHaveValue('')
	await title.fill(`杯测之夜 ${tag}`)
	await body.fill('<p>在码头。</p>')
	await page.getByRole('checkbox', { name: 'Draft' }).check()
	await page.getByRole('button', { name: 'Create' }).click()

	await expect(page.getByRole('heading', { level: 1, name: `Cupping night ${tag}` })).toBeVisible()
	const id = /#\/collections\/events\/(\w+)$/.exec(page.url())?.[1]
	expect(id).toBeDefined()
	expect(await editor.collection('events').getOne(id!)).toMatchObject({
		body_en: '<p>At the pier.</p>',
		body_ja: '',
		body_zh_hans: '<p>在码头。</p>',
		draft: true,
		slug: `cupping-night-${tag}`,
		title_en: `Cupping night ${tag}`,
		title_ja: `カッピングの夜 ${tag}`,
		title_zh_hans: `杯测之夜 ${tag}`,
	})

	// The saved values come back in their own tabs.
	await page.reload()
	await expect(title).toHaveValue(`Cupping night ${tag}`)
	await titleTabs.getByRole('tab', { name: 'Japanese' }).click()
	await expect(title).toHaveValue(`カッピングの夜 ${tag}`)
	await body.fill('<p>桟橋で。</p>')
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(`Saved “Cupping night ${tag}”.`)).toBeVisible()
	expect(await editor.collection('events').getOne(id!)).toMatchObject({
		body_en: '<p>At the pier.</p>',
		body_ja: '<p>桟橋で。</p>',
	})
})
