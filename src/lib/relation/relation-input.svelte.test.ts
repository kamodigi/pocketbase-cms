import type { RecordModel } from 'pocketbase'

import { render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import RecordForm from '#lib/form/record-form.svelte'
import { pb } from '#lib/pocketbase.js'

const navigation = vi.hoisted(() => ({ goto: vi.fn() }))
vi.mock('$app/navigation', () => navigation)
const toasts = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('svelte-sonner', () => ({ toast: toasts }))

const config: CmsConfig = {
	collections: {
		posts: { fields: { owner: { label: 'Owner' }, store: { label: 'Store' }, stores: { label: 'Also at' } } },
		stores: { list: { sort: 'name' }, titleField: 'name' },
	},
	version: 1,
}
const collections: SchemaCollection[] = [
	{
		fields: [
			{ name: 'id', primaryKey: true, type: 'text' },
			{ name: 'title', type: 'text' },
			{ collectionId: 'col_stores', maxSelect: 1, name: 'store', required: true, type: 'relation' },
			{ collectionId: 'col_stores', maxSelect: 2, name: 'stores', type: 'relation' },
		],
		id: 'col_posts',
		name: 'posts',
	},
	{
		fields: [
			{ name: 'id', primaryKey: true, type: 'text' },
			{ name: 'name', type: 'text' },
		],
		id: 'col_stores',
		name: 'stores',
	},
]
const stores = [
	{ id: 'harbor000000001', name: 'Harbor' },
	{ id: 'hill00000000002', name: 'Hill' },
	{ id: 'market000000003', name: 'Market' },
]

/**
A PocketBase with the three stores, 2 to a page, searched by name; saves are echoed back.
*/
function serve({ fail = false } = {}) {
	const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
		const url = new URL(String(input), 'http://localhost')
		if (init?.method !== 'GET') {
			return Response.json({ id: 'p1', ...(JSON.parse(String(init?.body)) as object) })
		}
		if (fail) return Response.json({ message: 'Something broke.' }, { status: 500 })
		const filter = url.searchParams.get('filter') ?? ''
		const search = /name ~ "%(.*)%"/.exec(filter)?.[1]
		const found = filter.includes('id = ')
			? stores.filter(store => filter.includes(`"${store.id}"`))
			: stores.filter(store => search === undefined || store.name.includes(search))
		const page = Number(url.searchParams.get('page'))
		const perPage = filter.includes('id = ') ? found.length : 2
		return Response.json({
			items: found.slice((page - 1) * perPage, page * perPage),
			page,
			perPage,
			totalItems: found.length,
			totalPages: Math.ceil(found.length / perPage),
		})
	})
	vi.stubGlobal('fetch', fetch)
	return fetch
}

function show(record?: Record<string, unknown>) {
	return render(RecordForm, {
		collection: 'posts',
		collections,
		config,
		label: 'Posts',
		record: record as RecordModel | undefined,
		schema: collections[0]!,
		uiLocale: 'en',
	})
}

function writes(fetch: ReturnType<typeof serve>) {
	return fetch.mock.calls
		.filter(([, init]) => init?.method !== 'GET')
		.map(([, init]) => JSON.parse(String(init?.body)) as unknown)
}

beforeEach(() => pb.authStore.save('token', { collectionId: 'c', collectionName: 'users', id: 'u1', role: 'editor' }))
afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
})

describe('a relation field', () => {
	it('picks one record from the dialog and saves its id', async () => {
		const user = userEvent.setup()
		const fetch = serve()
		show()

		// A required relation is refused while it is blank.
		await user.click(screen.getByRole('button', { name: 'Create' }))
		const choose = screen.getByRole('button', { name: 'Choose Store' })
		expect(choose).toHaveAttribute('aria-invalid', 'true')
		expect(choose).toHaveAccessibleDescription('This field is required.')
		expect(choose).toHaveFocus()

		await user.click(choose)
		const dialog = await screen.findByRole('dialog', { name: 'Choose Store' })
		await user.click(await within(dialog).findByRole('button', { name: 'Hill' }))

		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
		expect(screen.getByRole('button', { name: 'Remove Hill' })).toBeInTheDocument()
		expect(choose).not.toHaveAttribute('aria-invalid')
		await user.click(screen.getByRole('button', { name: 'Create' }))
		await waitFor(() => expect(writes(fetch)).toMatchObject([{ store: 'hill00000000002', stores: [] }]))
	})

	it('searches, pages and picks several records up to the maximum, keeping their order', async () => {
		const user = userEvent.setup()
		const fetch = serve()
		show()

		await user.click(screen.getByRole('button', { name: 'Choose Also at' }))
		const dialog = await screen.findByRole('dialog', { name: 'Choose Also at' })
		await within(dialog).findByRole('checkbox', { name: 'Harbor' })
		expect(within(dialog).queryByRole('checkbox', { name: 'Market' })).not.toBeInTheDocument()
		await user.click(within(dialog).getByRole('button', { name: 'Show more' }))
		await user.click(await within(dialog).findByRole('checkbox', { name: 'Market' }))

		await user.type(within(dialog).getByRole('searchbox', { name: 'Search' }), 'Harb{Enter}')
		await waitFor(() => expect(within(dialog).queryByRole('checkbox', { name: 'Market' })).not.toBeInTheDocument())
		await user.click(await within(dialog).findByRole('checkbox', { name: 'Harbor' }))
		expect(dialog).toHaveAccessibleDescription('2 of up to 2 chosen')

		// At the maximum, only the chosen ones can still be unchecked.
		await user.clear(within(dialog).getByRole('searchbox', { name: 'Search' }))
		await user.keyboard('{Enter}')
		expect(await within(dialog).findByRole('checkbox', { name: 'Hill' })).toBeDisabled()
		expect(within(dialog).getByRole('checkbox', { name: 'Harbor' })).toBeEnabled()

		await user.click(within(dialog).getByRole('button', { name: 'Done' }))
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
		expect(writes(fetch)).toEqual([])
	})

	it('names the chosen records of a saved one, and sends what is left after a removal', async () => {
		const user = userEvent.setup()
		const fetch = serve()
		show({ id: 'p1', store: 'harbor000000001', stores: ['market000000003', 'gone00000000009'], title: 'A' })

		expect(await screen.findByRole('button', { name: 'Remove Harbor' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Remove Market' })).toBeInTheDocument()
		// One PocketBase does not give back is shown by its id, and stays chosen.
		const gone = await screen.findByRole('button', { name: 'Remove gone00000000009' })

		await user.click(gone)
		expect(screen.getByRole('button', { name: 'Choose Also at' })).toHaveFocus()
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() => expect(writes(fetch)).toEqual([{ stores: ['market000000003'] }]))
	})

	it('says when the records cannot be loaded, and tries again', async () => {
		const user = userEvent.setup()
		serve({ fail: true })
		show()

		await user.click(screen.getByRole('button', { name: 'Choose Store' }))
		const dialog = await screen.findByRole('dialog')
		expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not load the records: Something broke.')

		serve()
		await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
		expect(await within(dialog).findByRole('button', { name: 'Harbor' })).toBeInTheDocument()
		expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
	})

	it('only shows the records of a read-only field', async () => {
		serve()
		render(RecordForm, {
			collection: 'posts',
			collections,
			config: { ...config, collections: { ...config.collections, posts: { fields: { store: { readonly: true } } } } },
			label: 'Posts',
			record: { id: 'p1', store: 'hill00000000002' } as unknown as RecordModel,
			schema: collections[0]!,
			uiLocale: 'en',
		})

		expect(await screen.findByText('Hill')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Remove Hill' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Choose store' })).not.toBeInTheDocument()
	})
})
