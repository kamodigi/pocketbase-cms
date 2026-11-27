// The list screens of the example presets: the article type (posts), the list type (stores), the
// media library and the single page (about).
import { expect, type Page, test } from '@playwright/test'
import PocketBase from 'pocketbase'

import { devAccounts } from '../pocketbase'

// A 1x1 transparent PNG.
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64',
)

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

/**
Lowercase and digits only, so it also fits the posts slug pattern.
*/
function uniqueTag(): string {
	return `t${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}

test('an article list is searched, filtered by state, sorted by date and paged', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	// Other tests share the PocketBase, so everything here is found through a tag of its own.
	const tag = uniqueTag()
	const posts = editor.collection('posts')
	// 20 to a page: 21 published posts, a scheduled one and a draft.
	for (let day = 1; day <= 21; day++) {
		const number = String(day).padStart(2, '0')
		await posts.create({
			published_at: `2020-01-${number} 12:00:00.000Z`,
			slug: `${tag}-${number}`,
			title: `${tag} & Roast ${number}`,
		})
	}
	await posts.create({
		category: 'event',
		published_at: '2999-05-01 12:00:00.000Z',
		slug: `${tag}-later`,
		title: `${tag} & Tasting`,
	})
	await posts.create({ draft: true, slug: `${tag}-draft`, title: `${tag} & Notes` })

	await signIn(page)
	const table = page.getByRole('table', { name: 'Posts' })
	await expect(table.getByRole('columnheader')).toHaveText(['Title', 'Category', 'Status', 'Published at', 'Updated'])

	// "&" in the search checks that the text survives the URL.
	const search = `${tag} &`
	await page.getByRole('searchbox', { name: 'Search' }).fill(search)
	// The search is in the URL once it has run; other posts may add up to the same total before.
	await expect(page).toHaveURL(/\?q=/)
	await expect(page.getByText('Total: 23')).toBeVisible()
	const rows = table.locator('tbody tr')
	await expect(rows).toHaveCount(20)
	// Newest publish date first.
	await expect(rows.first()).toContainText(`${tag} & Tasting`)
	await expect(rows.first()).toContainText('Event')
	await expect(rows.first()).toContainText('Scheduled')

	const pagination = page.getByRole('navigation', { name: 'Pagination' })
	await expect(pagination).toContainText('Page 1 of 2')
	await pagination.getByRole('button', { name: 'Next' }).click()
	await expect(pagination).toContainText('Page 2 of 2')
	await expect(rows).toHaveCount(3)

	// The page and the search survive a reload.
	await page.reload()
	await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue(search)
	await expect(pagination).toContainText('Page 2 of 2')
	await expect(rows).toHaveCount(3)

	// Opening a record and coming back keeps the list as it was.
	await rows.first().getByRole('link').click()
	await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
	await page.goBack()
	await expect(pagination).toContainText('Page 2 of 2')

	// Back through the pages.
	await page.goBack()
	await expect(pagination).toContainText('Page 1 of 2')
	await expect(rows).toHaveCount(20)

	const status = page.getByRole('combobox', { name: 'Status' })
	await status.click()
	await page.getByRole('option', { name: 'Draft' }).click()
	await expect(rows).toHaveCount(1)
	await expect(rows.first()).toContainText(`${tag} & Notes`)
	await expect(rows.first()).toContainText('Draft')

	await status.click()
	await page.getByRole('option', { name: 'Scheduled' }).click()
	await expect(rows).toHaveCount(1)
	await expect(rows.first()).toContainText(`${tag} & Tasting`)

	await status.click()
	await page.getByRole('option', { name: 'Published' }).click()
	await expect(page.getByText('Total: 21')).toBeVisible()
	await expect(rows.first()).toContainText(`${tag} & Roast 21`)

	// Oldest first, then newest first again.
	const publishedAt = table.getByRole('columnheader', { name: 'Published at' })
	await expect(publishedAt).toHaveAttribute('aria-sort', 'descending')
	await publishedAt.getByRole('button').click()
	await expect(publishedAt).toHaveAttribute('aria-sort', 'ascending')
	await expect(rows.first()).toContainText(`${tag} & Roast 01`)
	await publishedAt.getByRole('button').click()
	await expect(publishedAt).toHaveAttribute('aria-sort', 'descending')
	await expect(rows.first()).toContainText(`${tag} & Roast 21`)

	await page.getByRole('searchbox', { name: 'Search' }).fill(`${tag} nothing`)
	await expect(page.getByText('No records match.')).toBeVisible()
	await page.getByRole('button', { name: 'Clear search and filter' }).click()
	await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
	await expect(table).toBeVisible()
})

test('a flat list shows its columns and searches more than the title', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	await editor
		.collection('stores')
		.create({ address: `1 Harbor Road ${tag}`, name: 'Lighthouse', region: 'north', url: 'https://example.com/' })

	await signIn(page)
	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Stores' }).click()
	const table = page.getByRole('table', { name: 'Stores' })
	await expect(page.getByRole('heading', { level: 1, name: 'Stores' })).toBeVisible()
	await page.getByRole('searchbox', { name: 'Search' }).fill(tag)

	await expect(page.getByText('Total: 1')).toBeVisible()
	await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Region', 'Address', 'Website'])
	await expect(table.locator('tbody td')).toHaveText([
		'Lighthouse',
		'North',
		`1 Harbor Road ${tag}`,
		'https://example.com/',
	])
	// A list without publish states or date columns has no filter and no sort buttons.
	await expect(page.getByRole('combobox', { name: 'Status' })).toHaveCount(0)
	await expect(table.getByRole('button')).toHaveCount(0)

	// Another collection starts with an empty search.
	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Posts' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
	await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
})

test('the media list shows thumbnails', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	await editor.collection('media').create({
		alt: `${tag} beans`,
		file: new File([png], 'beans.png', { type: 'image/png' }),
	})

	await signIn(page)
	await page.goto(`/cms/#/collections/media?q=${tag}`)

	const table = page.getByRole('table', { name: 'Media' })
	await expect(table.getByRole('link', { name: `${tag} beans` })).toBeVisible()
	const image = table.getByRole('img')
	await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
})

test('a single page opens its record without a list', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const record = await editor.collection('about').getFirstListItem('')

	await signIn(page)
	const nav = page.getByRole('navigation', { name: 'Main navigation' })
	await nav.getByRole('link', { name: 'About page' }).click()

	await expect(page).toHaveURL(new RegExp(`#/collections/about/${record.id}$`))
	await expect(page.getByRole('heading', { level: 1, name: 'About page' })).toBeVisible()
	await expect(page.getByRole('table')).toHaveCount(0)
	await expect(nav.getByRole('link', { name: 'About page' })).toHaveAttribute('aria-current', 'page')

	// Back leads to where the user came from, not to the skipped list.
	await page.goBack()
	await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()

	await page.goto('/cms/#/collections/about')
	await expect(page).toHaveURL(new RegExp(`#/collections/about/${record.id}$`))
})
