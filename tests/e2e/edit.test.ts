// The edit screens of the example presets: create, update and delete a store (the list type), write
// a post (the article type), choose its related records and edit the single page.
import { expect, type Page, test } from '@playwright/test'
import PocketBase from 'pocketbase'

import { devAccounts } from '../pocketbase'

// A 1x1 transparent PNG.
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

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

test('a store is created, edited and deleted in the CMS alone', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	await signIn(page)
	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Stores' }).click()
	await page.getByRole('link', { name: 'New' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'New record' })).toBeVisible()

	// The required fields come from the schema, and nothing is sent until they are filled.
	await page.getByRole('button', { name: 'Create' }).click()
	const name = page.getByRole('textbox', { name: /^Name/ })
	await expect(name).toHaveAttribute('aria-invalid', 'true')
	await expect(name).toBeFocused()
	await expect(name).toHaveAccessibleDescription('This field is required.')
	const region = page.getByRole('combobox', { name: /^Region/ })
	await expect(region).toHaveAccessibleDescription('This field is required.')

	await name.fill(`Pier ${tag}`)
	await region.click()
	await page.getByRole('option', { name: 'South' }).click()
	await page.getByRole('textbox', { name: 'Address' }).fill('2 Dock Street')
	const website = page.getByRole('textbox', { name: 'Website' })
	await website.fill('example.com')
	await page.getByRole('button', { name: 'Create' }).click()
	await expect(website).toHaveAccessibleDescription('Enter a full URL, such as https://example.com/.')
	await website.fill('https://example.com/pier')
	await page.getByRole('button', { name: 'Create' }).click()

	await expect(page.getByText(`Created “Pier ${tag}”.`)).toBeVisible()
	await expect(page.getByRole('heading', { level: 1, name: `Pier ${tag}` })).toBeVisible()
	const id = /#\/collections\/stores\/(\w+)$/.exec(page.url())?.[1]
	expect(id).toBeDefined()
	expect(await editor.collection('stores').getOne(id!)).toMatchObject({
		address: '2 Dock Street',
		name: `Pier ${tag}`,
		region: 'south',
		url: 'https://example.com/pier',
	})
	// The timestamps are shown, not edited.
	await expect(page.getByRole('region', { name: 'Details' })).toContainText('Created')

	// Back skips the new-record screen it replaced.
	await page.goBack()
	await expect(page.getByRole('heading', { level: 1, name: 'Stores' })).toBeVisible()
	await page.getByRole('searchbox', { name: 'Search' }).fill(tag)
	await page.getByRole('link', { name: `Pier ${tag}` }).click()

	await page.getByRole('textbox', { name: 'Address' }).fill('3 Dock Street')
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(`Saved “Pier ${tag}”.`)).toBeVisible()
	await page.reload()
	await expect(page.getByRole('textbox', { name: 'Address' })).toHaveValue('3 Dock Street')

	await page.getByRole('button', { name: 'Delete' }).click()
	const dialog = page.getByRole('dialog', { name: 'Delete this record?' })
	await expect(dialog).toContainText(`“Pier ${tag}” will be deleted.`)
	// Cancel first: nothing happens.
	await dialog.getByRole('button', { name: 'Cancel' }).click()
	await expect(dialog).toBeHidden()
	await page.getByRole('button', { name: 'Delete' }).click()
	await dialog.getByRole('button', { name: 'Delete' }).click()

	await expect(page.getByText(`Deleted “Pier ${tag}”.`)).toBeVisible()
	await expect(page.getByRole('heading', { level: 1, name: 'Stores' })).toBeVisible()
	await expect(editor.collection('stores').getOne(id!)).rejects.toMatchObject({ status: 404 })
})

test('a post gets a slug from its title, and a taken slug is refused', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	await editor.collection('posts').create({ slug: `${tag}-taken`, title: 'Taken' })
	await signIn(page)
	await page.getByRole('link', { name: 'New' }).click()

	await page.getByRole('textbox', { name: /^Title/ }).fill(`${tag} Taken`)
	const slug = page.getByRole('textbox', { name: /^Slug/ })
	await expect(slug).toHaveValue(`${tag}-taken`)
	await page.getByRole('combobox', { name: 'Category' }).click()
	await page.getByRole('option', { name: 'Event' }).click()
	await page.getByLabel('Published at').fill('2030-04-01T09:30')
	await page.getByRole('checkbox', { name: 'Draft' }).check()
	// The body is HTML until the rich text editor arrives.
	await page.getByRole('textbox', { name: 'Body' }).fill('<p>Cupping at the pier.</p>')
	await page.getByRole('button', { name: 'Create' }).click()

	// PocketBase refuses the slug; its message is shown at the field.
	await expect(slug).toHaveAttribute('aria-invalid', 'true')
	await expect(slug).toHaveAccessibleDescription(/unique/i)

	await slug.fill(`${tag}-tasting`)
	await page.getByRole('button', { name: 'Create' }).click()
	await expect(page.getByRole('heading', { level: 1, name: `${tag} Taken` })).toBeVisible()

	const post = await editor
		.collection('posts')
		.getFirstListItem(editor.filter('slug = {:slug}', { slug: `${tag}-tasting` }))
	expect(post).toMatchObject({ body: '<p>Cupping at the pier.</p>', category: 'event', draft: true })
	// datetime-local is in the browser's time zone; PocketBase keeps the same moment in UTC.
	expect(new Date(post.published_at.replace(' ', 'T')).getTime()).toBe(new Date('2030-04-01T09:30').getTime())
})

test('the single page is edited, never created or deleted', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const about = await editor.collection('about').getFirstListItem('')
	await signIn(page)
	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'About page' }).click()

	await expect(page.getByRole('heading', { level: 1, name: 'About page' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
	const title = page.getByRole('textbox', { name: /^Title/ })
	await expect(title).toHaveValue(about.title)
	await title.fill(`${about.title}!`)
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(`Saved “${about.title}!”.`)).toBeVisible()
	const saved = await editor.collection('about').getOne(about.id)
	expect(saved.title).toBe(`${about.title}!`)
	await editor.collection('about').update(about.id, { title: about.title })

	// There is no new-record screen for it.
	await page.goto('/cms/#/collections/about/new')
	await expect(page).toHaveURL(new RegExp(`#/collections/about/${about.id}$`))
})

test('the cover and the stores of a post are searched, chosen and saved', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	for (const name of ['Pier', 'Market']) {
		await editor.collection('stores').create({ name: `${name} ${tag}`, region: 'south' })
	}
	const file = new File([Buffer.from(pixel, 'base64')], 'pixel.png', { type: 'image/png' })
	const image = await editor.collection('media').create({ alt: `Cup ${tag}`, file })
	await signIn(page)
	await page.getByRole('link', { name: 'New' }).click()
	await page.getByRole('textbox', { name: /^Title/ }).fill(tag)

	// One record: the cover, chosen from the media collection by its alt text.
	await page.getByRole('button', { name: 'Choose Cover image' }).click()
	const covers = page.getByRole('dialog', { name: 'Choose Cover image' })
	await covers.getByRole('searchbox', { name: 'Search' }).fill(tag)
	await covers.getByRole('button', { name: `Cup ${tag}` }).click()
	await expect(covers).toBeHidden()

	// Several records, in the order they are chosen. Enter searches without saving the post.
	const chooseStores = page.getByRole('button', { name: 'Choose Stores' })
	await chooseStores.click()
	const stores = page.getByRole('dialog', { name: 'Choose Stores' })
	await stores.getByRole('searchbox', { name: 'Search' }).fill(tag)
	await stores.getByRole('searchbox', { name: 'Search' }).press('Enter')
	await expect(stores.getByRole('checkbox')).toHaveCount(2)
	await stores.getByRole('checkbox', { name: `Pier ${tag}` }).check()
	await stores.getByRole('checkbox', { name: `Market ${tag}` }).check()
	await expect(stores).toHaveAccessibleDescription('2 of up to 5 chosen')
	await page.keyboard.press('Escape')
	await expect(stores).toBeHidden()
	await expect(chooseStores).toBeFocused()

	await page.getByRole('button', { name: 'Create' }).click()
	await expect(page.getByText(`Created “${tag}”.`)).toBeVisible()
	const post = await editor
		.collection('posts')
		.getFirstListItem(editor.filter('slug = {:slug}', { slug: tag }), { expand: 'stores' })
	expect(post.cover).toBe(image.id)
	expect((post.expand?.stores as { name: string }[]).map(store => store.name)).toEqual([`Pier ${tag}`, `Market ${tag}`])

	// The saved records are named again, and a removal is saved.
	await page.reload()
	await expect(page.getByRole('button', { name: `Remove Cup ${tag}` })).toBeVisible()
	await page.getByRole('button', { name: `Remove Pier ${tag}` }).click()
	await page.getByRole('button', { name: `Remove Cup ${tag}` }).click()
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(`Saved “${tag}”.`)).toBeVisible()
	const saved = await editor.collection('posts').getOne(post.id)
	expect(saved.cover).toBe('')
	expect(saved.stores).toEqual([post.stores[1]])
})
