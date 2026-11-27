import { expect, test } from '@playwright/test'

import { devAccounts, type PocketBaseServer, startPocketBase } from '../pocketbase'

// The same build as the other tests serve in pb_public/cms/, put in other folders of pb_public.
for (const folder of ['edit', 'sites/lantern-editor']) {
	test.describe(`the build in pb_public/${folder}/`, () => {
		let server: PocketBaseServer

		test.beforeAll(async () => {
			server = await startPocketBase({
				// The hooks read pb_public/cms/config.json unless told otherwise (see README.md).
				env: { PBCMS_CONFIG_PATH: 'examples/lantern-coffee/cms.config.json' },
				public: { [`${folder}/config.json`]: 'examples/lantern-coffee/cms.config.json', [folder]: 'build' },
			})
		})
		test.afterAll(() => server.stop())

		test('loads its files and config from that folder, and keeps a deep link on reload', async ({ page }) => {
			const files: string[] = []
			const failed: string[] = []
			page.on('response', response => {
				const { pathname } = new URL(response.url())
				if (!pathname.startsWith('/api/')) files.push(pathname)
				if (response.status() >= 400) failed.push(`${response.status()} ${pathname}`)
			})

			// Without the trailing slash, PocketBase redirects to the folder.
			await page.goto(`${server.url}/${folder}`)
			await expect(page).toHaveURL(`${server.url}/${folder}/#/login`)
			await expect(page.getByText('Lantern Coffee')).toBeVisible()

			await page.getByLabel('Email').fill(devAccounts.editor.email)
			await page.getByLabel('Password').fill(devAccounts.editor.password)
			await page.getByRole('button', { name: 'Sign in' }).click()
			await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
			await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Stores' }).click()

			await page.reload()
			await expect(page).toHaveURL(`${server.url}/${folder}/#/collections/stores`)
			await expect(page.getByRole('heading', { level: 1, name: 'Stores' })).toBeVisible()

			expect(files).toContain(`/${folder}/config.json`)
			expect(files.some(file => file.startsWith(`/${folder}/_app/`))).toBe(true)
			// The redirect is the one request outside the folder's own files.
			expect(files.filter(file => !file.startsWith(`/${folder}/`))).toEqual([`/${folder}`])
			expect(failed).toEqual([])
		})
	})
}
