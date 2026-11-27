import PocketBase from 'pocketbase'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openPreview } from './open-preview'

const target = { collection: 'posts', id: 'p1', url: 'https://example.com/news/preview' }

/**
A stand-in for the new tab, which jsdom cannot open.
*/
function openTab() {
	const tab = {
		close: vi.fn(),
		closed: false,
		document: document.implementation.createHTMLDocument(),
		opener: globalThis as unknown,
	}
	const open = vi.spyOn(globalThis, 'open').mockReturnValue(tab as unknown as Window)
	return { open, tab }
}

function serve(status: number, body: unknown) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(body, { status }))
	vi.stubGlobal('fetch', fetch)
	return fetch
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('openPreview', () => {
	it('posts the collection, id and a new token to the site from a tab that cannot reach the CMS', async () => {
		const { open, tab } = openTab()
		const fetch = serve(200, { expiresAt: '2030-01-01T00:00:00.000Z', token: 'a.b.c' })
		const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

		await expect(openPreview(new PocketBase('http://pb.test'), target)).resolves.toBe('opened')

		expect(open).toHaveBeenCalledWith('', '_blank')
		expect(tab.opener).toBeNull()
		expect(String(fetch.mock.lastCall![0])).toBe('http://pb.test/api/cms/preview/posts/p1/token')
		expect(fetch.mock.lastCall![1]?.method).toBe('POST')
		expect(submit).toHaveBeenCalledOnce()
		const form = tab.document.querySelector('form')!
		expect(form.method).toBe('post')
		expect(form.action).toBe(target.url)
		const inputs = Array.from(form.querySelectorAll('input'), input => [input.name, input.value])
		expect(Object.fromEntries(inputs)).toEqual({
			collection: 'posts',
			id: 'p1',
			token: 'a.b.c',
		})
	})

	it('also posts the content locale when there is one', async () => {
		const { tab } = openTab()
		serve(200, { token: 'a.b.c' })
		vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

		await openPreview(new PocketBase('http://pb.test'), { ...target, locale: 'zh-Hans' })

		expect(tab.document.querySelector<HTMLInputElement>('input[name="locale"]')?.value).toBe('zh-Hans')
	})

	it('asks for no token when the browser blocks the tab', async () => {
		// eslint-disable-next-line unicorn/no-null -- what window.open answers when blocked
		vi.spyOn(globalThis, 'open').mockReturnValue(null)
		const fetch = serve(200, {})

		await expect(openPreview(new PocketBase('http://pb.test'), target)).resolves.toBe('blocked')
		expect(fetch).not.toHaveBeenCalled()
	})

	it('closes the tab again when no token is given', async () => {
		const { tab } = openTab()
		serve(404, { message: 'The record was not found.' })

		await expect(openPreview(new PocketBase('http://pb.test'), target)).rejects.toMatchObject({ status: 404 })
		expect(tab.close).toHaveBeenCalledOnce()
		expect(tab.document.querySelector('form')).toBeNull()
	})

	it('sends nothing to a tab the user has closed', async () => {
		const { tab } = openTab()
		tab.closed = true
		serve(200, { token: 'a.b.c' })

		await openPreview(new PocketBase('http://pb.test'), target)
		expect(tab.document.querySelector('form')).toBeNull()
	})
})
