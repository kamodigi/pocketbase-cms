// "Preview on site": the button on the edit screen posts a preview token to the example preview page
// (examples/lantern-coffee/preview-site/), which shows the draft.
import { expect, type Page, test } from '@playwright/test'
import { once } from 'node:events'
import { type AddressInfo } from 'node:net'
import PocketBase from 'pocketbase'

import { createPreviewServer } from '../../examples/lantern-coffee/preview-site/server.mjs'
import { devAccounts } from '../pocketbase'

async function signIn(page: Page, siteUrl: string) {
	// The example config, with previewUrl pointing at the preview page the test serves.
	await page.route('**/cms/config.json', async route => {
		const response = await route.fetch()
		const config = await response.json()
		config.collections.posts.previewUrl = siteUrl
		config.collections.events.previewUrl = siteUrl
		await route.fulfill({ json: config, response })
	})
	await page.goto('/cms/#/login')
	await page.getByLabel('Email').fill(devAccounts.editor.email)
	await page.getByLabel('Password').fill(devAccounts.editor.password)
	await page.getByRole('button', { name: 'Sign in' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
}

/**
The example preview page, on a free port: the example config's port may be taken.
*/
async function startSite(pocketbaseUrl: string) {
	const site = createPreviewServer(pocketbaseUrl)
	site.listen(0, '127.0.0.1')
	await once(site, 'listening')
	return {
		close: () => {
			site.closeAllConnections()
			site.close()
		},
		url: `http://127.0.0.1:${(site.address() as AddressInfo).port}/preview`,
	}
}

test('a draft is shown on the site from the edit screen', async ({ baseURL, page }) => {
	const editor = new PocketBase(baseURL)
	await editor.collection('users').authWithPassword(devAccounts.editor.email, devAccounts.editor.password)
	const tag = `t${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
	const draft = await editor
		.collection('posts')
		.create({ body: `<p>Beans of ${tag}.</p>`, draft: true, slug: tag, title: `Draft ${tag}` })
	const site = await startSite(baseURL!)
	const siteUrl = site.url
	await signIn(page, siteUrl)
	await page.goto(`/cms/#/collections/posts/${draft.id}`)
	await expect(page.getByRole('heading', { level: 1, name: `Draft ${tag}` })).toBeVisible()

	const opened = page.context().waitForEvent('page')
	const posted = page.context().waitForEvent('request', request => request.url() === siteUrl)
	await page.getByRole('button', { name: 'Preview on site' }).click()
	const preview = await opened
	const request = await posted

	// A form POST: the token is in the body, never in the URL.
	expect(request.method()).toBe('POST')
	const form = new URLSearchParams(request.postData()!)
	expect(form.keys().toArray()).toEqual(['collection', 'id', 'token'])
	expect(form.get('collection')).toBe('posts')
	expect(form.get('id')).toBe(draft.id)
	await expect(preview).toHaveURL(siteUrl)
	await expect(preview.getByRole('heading', { level: 1, name: `Draft ${tag}` })).toBeVisible()
	await expect(preview.getByText(`Beans of ${tag}.`)).toBeVisible()
	expect(await preview.evaluate(() => window.opener === null)).toBe(true)

	// What is shown is the saved record, and the CMS says so while there are unsaved changes.
	await page.getByRole('textbox', { name: /^Title/ }).fill(`Renamed ${tag}`)
	await expect(page.getByText('The preview does not show unsaved changes.')).toBeVisible()
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(`Saved “Renamed ${tag}”.`)).toBeVisible()
	await expect(page.getByText('The preview does not show unsaved changes.')).toBeHidden()
	const reopened = page.context().waitForEvent('page')
	await page.getByRole('button', { name: 'Preview on site' }).click()
	const second = await reopened
	await expect(second.getByRole('heading', { level: 1, name: `Renamed ${tag}` })).toBeVisible()

	// A collection without previewUrl, and a record not yet created, have no button.
	await page.goto('/cms/#/collections/posts/new')
	await expect(page.getByRole('heading', { level: 1, name: 'New record' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Preview on site' })).toHaveCount(0)
	await page.goto('/cms/#/collections/stores')
	await page.getByRole('link', { name: 'New' }).click()
	await expect(page.getByRole('button', { name: 'Preview on site' })).toHaveCount(0)
	await editor.collection('posts').delete(draft.id)
	site.close()
})

test('a localized draft is previewed in the language of the open tab', async ({ baseURL, page }) => {
	const editor = new PocketBase(baseURL)
	await editor.collection('users').authWithPassword(devAccounts.editor.email, devAccounts.editor.password)
	const tag = `t${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
	const draft = await editor
		.collection('events')
		.create({ draft: true, slug: tag, title_en: `Tasting ${tag}`, title_zh_hans: `品鉴会 ${tag}` })
	const site = await startSite(baseURL!)
	await signIn(page, site.url)
	await page.goto(`/cms/#/collections/events/${draft.id}`)
	await expect(page.getByRole('heading', { level: 1, name: `Tasting ${tag}` })).toBeVisible()

	async function openPreviewTab() {
		const opened = page.context().waitForEvent('page')
		const posted = page.context().waitForEvent('request', request => request.url() === site.url)
		await page.getByRole('button', { name: 'Preview on site' }).click()
		const request = await posted
		const form = new URLSearchParams(request.postData()!)
		return { form, preview: await opened }
	}

	// The base locale is open first.
	const base = await openPreviewTab()
	expect(base.form.keys().toArray()).toEqual(['collection', 'id', 'token', 'locale'])
	expect(base.form.get('locale')).toBe('en')
	await expect(base.preview.getByRole('heading', { level: 1, name: `Tasting ${tag}` })).toBeVisible()

	await page.getByRole('tablist', { name: 'Language of Body' }).getByRole('tab', { name: 'Simplified Chinese' }).click()
	const chinese = await openPreviewTab()
	expect(chinese.form.get('locale')).toBe('zh-Hans')
	await expect(chinese.preview.getByRole('heading', { level: 1, name: `品鉴会 ${tag}` })).toBeVisible()

	await editor.collection('events').delete(draft.id)
	site.close()
})
