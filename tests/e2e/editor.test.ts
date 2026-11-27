// The rich text editor: a post's body is written with the toolbar, the slash menu and the selection
// menu, an image is inserted from the media library, and PocketBase stores HTML that its sanitizer
// keeps, with the image's width, height and media id.
import { expect, type Page, test } from '@playwright/test'
import { crc32, deflateSync } from 'node:zlib'
import PocketBase from 'pocketbase'

import { devAccounts } from '../pocketbase'

async function asEditor(baseURL: string): Promise<PocketBase> {
	const pb = new PocketBase(baseURL)
	await pb.collection('users').authWithPassword(devAccounts.editor.email, devAccounts.editor.password)
	return pb
}

/**
A PNG of one color, `width` by `height` pixels.
*/
function png(width: number, height: number): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4)
		length.writeUInt32BE(data.length)
		const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
		const crc = Buffer.alloc(4)
		crc.writeUInt32BE(crc32(body))
		return Buffer.concat([length, body, crc])
	}
	const header = Buffer.alloc(13)
	header.writeUInt32BE(width, 0)
	header.writeUInt32BE(height, 4)
	header[8] = 8
	header[9] = 2
	const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x9a)])
	const pixels = Buffer.concat(Array.from({ length: height }, () => row))
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(pixels)),
		chunk('IEND', Buffer.alloc(0)),
	])
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

test('a post body is written with the editor and saved with an image from the media library', async ({
	baseURL,
	page,
}) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	const form = new FormData()
	form.append('alt', `Roastery ${tag}`)
	const bytes = new Uint8Array(png(64, 48))
	form.append('file', new Blob([bytes], { type: 'image/png' }), 'roastery.png')
	form.append('width', '64')
	form.append('height', '48')
	form.append('mime', 'image/png')
	form.append('uploadedBy', editor.authStore.record!.id)
	const media = await editor.collection('media').create(form)

	await signIn(page)
	await page.getByRole('link', { name: 'New' }).click()
	await page.getByRole('textbox', { name: /^Title/ }).fill(tag)

	const body = page.getByRole('textbox', { name: 'Body' })
	const toolbar = page.getByRole('toolbar', { name: 'Formatting of Body' })
	await body.click()
	await page.keyboard.type('Opening hours')
	await toolbar.getByRole('combobox', { name: 'Text style' }).selectOption('Heading 2')
	await page.keyboard.press('End')
	await page.keyboard.press('Enter')
	await page.keyboard.type('We open at eight.')

	// The selection menu makes the selected word bold.
	await page.keyboard.press('ArrowLeft')
	for (let index = 0; index < 'eight'.length; index++) await page.keyboard.press('Shift+ArrowLeft')
	const selectionMenu = page.getByRole('toolbar', { name: 'Selected text' })
	await selectionMenu.getByRole('button', { name: 'Bold' }).click()
	await expect(toolbar.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')

	// The slash menu turns a new line into a quote.
	await page.keyboard.press('End')
	await page.keyboard.press('Enter')
	await page.keyboard.type('/quo')
	const slashMenu = page.getByRole('listbox', { name: 'Insert a block' })
	await expect(slashMenu.getByRole('option')).toHaveText(['Quote'])
	await page.keyboard.press('Enter')
	await expect(slashMenu).toBeHidden()
	await page.keyboard.type('Freshly roasted.')

	// A link on selected text.
	await page.keyboard.press('Enter')
	await page.keyboard.press('Enter')
	await page.keyboard.type('Menu')
	await page.keyboard.press('Shift+Home')
	await selectionMenu.getByRole('button', { name: 'Link' }).click()
	await page.getByRole('textbox', { name: 'Link URL' }).fill('example.com/menu')
	await page.keyboard.press('Enter')
	await expect(body.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', 'https://example.com/menu')

	// An image from the media library, found by its alt text.
	await page.keyboard.press('End')
	await toolbar.getByRole('button', { name: 'Insert an image' }).click()
	const picker = page.getByRole('dialog', { name: 'Insert an image into Body' })
	await picker.getByRole('searchbox', { name: 'Search' }).fill(`Roastery ${tag}`)
	await picker.getByRole('button', { name: `Roastery ${tag}` }).click()
	await expect(picker).toBeHidden()
	const image = body.getByRole('img', { name: `Roastery ${tag}` })
	await expect(image).toHaveAttribute('width', '64')
	await expect(image).toHaveAttribute('height', '48')
	await expect(body).toBeFocused()

	// A caption from the menu of the selected image.
	await image.click()
	const figureMenu = page.getByRole('group', { name: 'Selected image' })
	await figureMenu.getByRole('textbox', { name: 'Caption' }).fill('Our roastery')
	await figureMenu.getByRole('button', { name: 'Apply' }).click()
	await expect(body.locator('figcaption')).toHaveText('Our roastery')

	await page.getByRole('button', { name: 'Create' }).click()
	await expect(page.getByText(`Created “${tag}”.`)).toBeVisible()

	const post = await editor.collection('posts').getFirstListItem(editor.filter('slug = {:slug}', { slug: tag }))
	const stored = post.body as string
	expect(stored).toMatch(/^<h2 id="h[\da-f]{7}">Opening hours<\/h2><p>We open at <strong>eight<\/strong>\.<\/p>/)
	expect(stored).toContain('<blockquote><p>Freshly roasted.</p></blockquote>')
	expect(stored).toContain('<a href="https://example.com/menu">Menu</a>')
	// The API gives `src` first, pointed at the file's current URL; the rest is as the editor wrote it.
	expect(stored).toMatch(
		new RegExp(
			String.raw`<figure><img src="[^"]+/api/files/\w+/${media.id}/roastery_\w+\.png" alt="Roastery ${tag}" width="64" height="48" data-media-id="${media.id}"><figcaption>Our roastery</figcaption></figure>$`,
		),
	)

	// Opened again, the editor shows what was saved, and an edit is saved too.
	await page.reload()
	await expect(body.getByRole('heading', { level: 2, name: 'Opening hours' })).toBeVisible()
	await expect(body.getByRole('img', { name: `Roastery ${tag}` })).toHaveAttribute('width', '64')
	await body.getByRole('heading', { level: 2 }).click()
	await page.keyboard.press('End')
	await page.keyboard.type(' and days')
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(`Saved “${tag}”.`)).toBeVisible()
	const edited = await editor.collection('posts').getOne(post.id)
	expect(edited.body).toMatch(/^<h2 id="h[\da-f]{7}">Opening hours and days<\/h2>/)
	expect(edited.body).not.toContain(stored.slice(0, 20))
})
