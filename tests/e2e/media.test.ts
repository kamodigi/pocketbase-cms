// Images: uploaded to the media library and replaced there, and uploaded from the image picker of a
// post. The browser makes them smaller first, and the media record keeps their width and height.
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
Picks a file in the browser's file dialog that `button` opens.
*/
async function choose(page: Page, button: ReturnType<Page['getByRole']>, file: { buffer: Buffer; name: string }) {
	const chooser = page.waitForEvent('filechooser')
	await button.click()
	const dialog = await chooser
	await dialog.setFiles({ ...file, mimeType: 'image/png' })
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
	// 8 bits per channel, RGB.
	header[8] = 8
	header[9] = 2
	// Each row starts with its filter type, 0.
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

function uniqueTag(): string {
	return `t${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}

test('an image is uploaded to the media library smaller, and replaced', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	await signIn(page)
	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Media' }).click()
	await page.getByRole('link', { name: 'New' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'New record' })).toBeVisible()

	// The alt text and the image are both required.
	await page.getByRole('button', { name: 'Create' }).click()
	const chooseImage = page.getByRole('button', { name: 'Choose a file for Image' })
	await expect(chooseImage).toHaveAccessibleDescription('This field is required.')

	await page.getByRole('textbox', { name: /^Alt text/ }).fill(`Lantern ${tag}`)
	await choose(page, chooseImage, { buffer: png(2400, 1200), name: 'lantern.png' })
	// Written as WebP, which Chromium can write.
	await expect(page.getByText('lantern.webp')).toBeVisible()
	await page.getByRole('button', { name: 'Create' }).click()
	await expect(page.getByText(`Created “Lantern ${tag}”.`)).toBeVisible()

	// The screen moves to the new record's address after the message.
	await expect(page).toHaveURL(/#\/collections\/media\/(?!new$)\w+$/)
	const id = /#\/collections\/media\/(\w+)$/.exec(page.url())?.[1]
	const created = await editor.collection('media').getOne(id!)
	expect(created).toMatchObject({
		alt: `Lantern ${tag}`,
		height: 960,
		mime: 'image/webp',
		uploadedBy: editor.authStore.record!.id,
		width: 1920,
	})
	expect(created.file).toMatch(/^lantern_\w+\.webp$/)
	// The saved image is shown, with its new size.
	await expect(page.getByRole('link', { name: created.file as string })).toBeVisible()
	await expect(page.getByRole('spinbutton', { name: 'width' })).toHaveValue('1920')

	// A smaller image is not made larger.
	await choose(page, page.getByRole('button', { name: 'Replace the file of Image' }), {
		buffer: png(800, 600),
		name: 'door.png',
	})
	await expect(page.getByText('door.webp')).toBeVisible()
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(`Saved “Lantern ${tag}”.`)).toBeVisible()
	const replaced = await editor.collection('media').getOne(id!)
	expect(replaced).toMatchObject({ height: 600, mime: 'image/webp', width: 800 })
	expect(replaced.file).toMatch(/^door_\w+\.webp$/)
	await expect(page.getByRole('spinbutton', { name: 'height' })).toHaveValue('600')
})

test('a cover image is uploaded from the picker of a post and chosen', async ({ baseURL, page }) => {
	const editor = await asEditor(baseURL!)
	const tag = uniqueTag()
	await signIn(page)
	await page.getByRole('link', { name: 'New' }).click()
	await page.getByRole('textbox', { name: /^Title/ }).fill(tag)

	await page.getByRole('button', { name: 'Choose Cover image' }).click()
	const dialog = page.getByRole('dialog', { name: 'Choose Cover image' })
	const upload = dialog.getByRole('form', { name: 'Upload a new image' })
	await choose(page, upload.getByRole('button', { name: 'Choose an image' }), {
		buffer: png(3000, 1000),
		name: 'Window seat.png',
	})
	await expect(upload.getByText('Window seat.webp')).toBeVisible()
	// Nothing is uploaded without alt text.
	await upload.getByRole('button', { name: 'Upload' }).click()
	await expect(upload.getByRole('textbox', { name: /^Alt text/ })).toHaveAccessibleDescription(
		/This field is required\.$/,
	)
	await upload.getByRole('textbox', { name: /^Alt text/ }).fill(`Window ${tag}`)
	await upload.getByRole('button', { name: 'Upload' }).click()

	// One image: choosing it closes the picker.
	await expect(dialog).toBeHidden()
	await expect(page.getByRole('button', { name: `Remove Window ${tag}` })).toBeVisible()
	await page.getByRole('button', { name: 'Create' }).click()
	await expect(page.getByText(`Created “${tag}”.`)).toBeVisible()

	const post = await editor.collection('posts').getFirstListItem(editor.filter('slug = {:slug}', { slug: tag }), {
		expand: 'cover',
	})
	expect(post.expand?.cover).toMatchObject({ alt: `Window ${tag}`, height: 640, mime: 'image/webp', width: 1920 })

	// The picker finds it again by its alt text, with its thumbnail.
	await page.reload()
	await page.getByRole('button', { name: 'Choose Cover image' }).click()
	await dialog.getByRole('searchbox', { name: 'Search' }).fill(`Window ${tag}`)
	const tile = dialog.getByRole('button', { name: `Window ${tag}` })
	await expect(tile).toHaveAttribute('aria-pressed', 'true')
	await expect(tile.locator('img')).toHaveJSProperty('naturalWidth', 160)
})
