import type { RecordModel } from 'pocketbase'

import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import { pb } from '#lib/pocketbase.js'

import RecordForm from './record-form.svelte'

const navigation = vi.hoisted(() => ({ goto: vi.fn() }))
vi.mock('$app/navigation', () => navigation)
const toasts = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('svelte-sonner', () => ({ toast: toasts }))

const config: CmsConfig = {
	collections: {
		about: { singleton: true },
		posts: {
			fields: {
				pinned: { help: 'Shown first.', label: 'Pinned' },
				slug: { label: 'Slug', slugFrom: 'title' },
				title: { label: 'Title' },
			},
			form: { main: ['title', 'slug'], side: ['pinned', 'rank'] },
		},
	},
	version: 1,
}
const schema: SchemaCollection = {
	fields: [
		{ name: 'id', primaryKey: true, type: 'text' },
		{ max: 20, name: 'title', required: true, type: 'text' },
		{ name: 'slug', pattern: '^[a-z0-9-]+$', required: true, type: 'text' },
		{ name: 'pinned', type: 'bool' },
		{ name: 'rank', onlyInt: true, type: 'number' },
		{ name: 'updated', type: 'autodate' },
	],
	name: 'posts',
}
const record = {
	collectionName: 'posts',
	id: 'p1',
	pinned: false,
	rank: 2,
	slug: 'autumn',
	title: 'Autumn',
	updated: '2026-01-02 03:04:00.000Z',
} as unknown as RecordModel

function sent(fetch: ReturnType<typeof serve>) {
	const [url, init] = fetch.mock.lastCall!
	return { body: init?.body ? JSON.parse(String(init.body)) : undefined, method: init?.method, url: String(url) }
}

function serve(status: number, body: unknown) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () =>
		status === 204 ? new Response(undefined, { status }) : Response.json(body, { status }),
	)
	vi.stubGlobal('fetch', fetch)
	return fetch
}

function show(props: { collection?: string; record?: RecordModel } = {}) {
	return render(RecordForm, {
		collection: 'posts',
		config,
		label: 'Posts',
		schema,
		uiLocale: 'en',
		...props,
	})
}

beforeEach(() => pb.authStore.save('token', { collectionId: 'c', collectionName: 'users', id: 'u1', role: 'editor' }))
afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
})

describe('RecordForm', () => {
	it('checks the inputs before creating, and shows what is wrong', async () => {
		const user = userEvent.setup()
		const fetch = serve(200, {})
		show()
		expect(screen.getByRole('heading', { level: 1, name: 'New record' })).toBeInTheDocument()
		// Nothing to show yet for a timestamp, and no delete on a new record.
		expect(screen.queryByText('updated')).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'Create' }))

		const title = screen.getByRole('textbox', { name: /^Title/ })
		expect(title).toHaveAttribute('aria-invalid', 'true')
		expect(title).toHaveAccessibleDescription('This field is required.')
		expect(title).toHaveFocus()
		expect(toasts.error).toHaveBeenCalledWith('Could not save. Fix the fields with errors.')
		expect(fetch).not.toHaveBeenCalled()

		// The error goes as soon as the value is fixed.
		await user.type(title, 'Winter')
		expect(title).not.toHaveAttribute('aria-invalid')
	})

	it('suggests a slug from the title until the slug is written by hand', async () => {
		const user = userEvent.setup()
		show()
		const title = screen.getByRole('textbox', { name: /^Title/ })
		const slug = screen.getByRole('textbox', { name: /^Slug/ })

		await user.type(title, 'Winter Blend')
		expect(slug).toHaveValue('winter-blend')

		await user.clear(slug)
		await user.type(slug, 'my-own')
		await user.type(title, ' 2026')
		expect(slug).toHaveValue('my-own')

		await user.click(screen.getByRole('button', { name: 'Make from Title' }))
		expect(slug).toHaveValue('winter-blend-2026')
	})

	it('creates the record and opens it in place of the new-record screen', async () => {
		const user = userEvent.setup()
		const fetch = serve(200, { ...record, id: 'p9', slug: 'winter', title: 'Winter' })
		show()

		await user.type(screen.getByRole('textbox', { name: /^Title/ }), 'Winter')
		await user.click(screen.getByRole('checkbox', { name: 'Pinned' }))
		await user.type(screen.getByRole('spinbutton', { name: 'rank' }), '3')
		await user.click(screen.getByRole('button', { name: 'Create' }))

		await waitFor(() => expect(navigation.goto).toHaveBeenCalled())
		expect(sent(fetch)).toEqual({
			body: { pinned: true, rank: 3, slug: 'winter', title: 'Winter' },
			method: 'POST',
			url: expect.stringMatching(/\/api\/collections\/posts\/records(\?|$)/),
		})
		expect(navigation.goto).toHaveBeenCalledWith(expect.stringMatching(/#\/collections\/posts\/p9$/), {
			replaceState: true,
		})
		expect(toasts.success).toHaveBeenCalledWith('Created “Winter”.')
	})

	it('saves only the changed fields of a record', async () => {
		const user = userEvent.setup()
		const fetch = serve(200, { ...record, title: 'Autumn blend' })
		show({ record })
		expect(screen.getByRole('heading', { level: 1, name: 'Autumn' })).toBeInTheDocument()
		expect(screen.getByText('Updated')).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'Save' }))
		expect(toasts.info).toHaveBeenCalledWith('Nothing has changed.')
		expect(fetch).not.toHaveBeenCalled()

		// An existing slug is the user's own: it does not follow the title.
		await user.type(screen.getByRole('textbox', { name: /^Title/ }), ' blend')
		expect(screen.getByRole('textbox', { name: /^Slug/ })).toHaveValue('autumn')
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Saved “Autumn blend”.'))
		expect(sent(fetch)).toMatchObject({ body: { title: 'Autumn blend' }, method: 'PATCH' })
		expect(sent(fetch).url).toMatch(/\/api\/collections\/posts\/records\/p1(\?|$)/)
		expect(screen.getByRole('heading', { level: 1, name: 'Autumn blend' })).toBeInTheDocument()
	})

	it('shows the messages PocketBase gives for a refused save', async () => {
		const user = userEvent.setup()
		serve(400, {
			data: {
				other: { code: 'x', message: 'Something else.' },
				slug: { code: 'validation_not_unique', message: 'Value must be unique.' },
			},
			message: 'Failed to update record.',
			status: 400,
		})
		show({ record })

		const slug = screen.getByRole('textbox', { name: /^Slug/ })
		await user.clear(slug)
		await user.type(slug, 'taken')
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() => expect(slug).toHaveAccessibleDescription('Value must be unique.'))
		expect(screen.getByRole('alert')).toHaveTextContent('other: Something else.')
	})

	it('deletes after confirming and goes back to the list', async () => {
		const user = userEvent.setup()
		const fetch = serve(204, undefined)
		show({ record })

		await user.click(screen.getByRole('button', { name: 'Delete' }))
		const dialog = await screen.findByRole('dialog', { name: 'Delete this record?' })
		expect(dialog).toHaveTextContent('“Autumn” will be deleted. This cannot be undone.')
		await user.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)

		await waitFor(() => expect(navigation.goto).toHaveBeenCalledWith(expect.stringMatching(/#\/collections\/posts$/)))
		expect(sent(fetch)).toMatchObject({ method: 'DELETE' })
		expect(toasts.success).toHaveBeenCalledWith('Deleted “Autumn”.')
	})

	it('cannot delete a single page', () => {
		show({ collection: 'about', record: { ...record, collectionName: 'about' } })

		expect(screen.getByRole('heading', { level: 1, name: 'Posts' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
		expect(screen.queryByRole('link', { name: 'Back to the list' })).not.toBeInTheDocument()
	})
})
