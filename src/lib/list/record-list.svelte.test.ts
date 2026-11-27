import type { RecordModel } from 'pocketbase'

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import type { RecordList as List } from './load'

import { buildListModel } from './model'
import { type ListQuery, parseListQuery } from './query'
import RecordList from './record-list.svelte'

const navigation = vi.hoisted(() => ({ beforeNavigate: vi.fn(), goto: vi.fn() }))
vi.mock('$app/navigation', () => navigation)

const config: CmsConfig = {
	collections: {
		posts: {
			list: { columns: ['title', '$status', 'published_at'], sort: '-published_at' },
			status: { draftField: 'draft', publishedAtField: 'published_at' },
		},
	},
	version: 1,
}
const schema: SchemaCollection[] = [
	{
		fields: [
			{ name: 'title', type: 'text' },
			{ name: 'draft', type: 'bool' },
			{ name: 'published_at', type: 'date' },
		],
		name: 'posts',
	},
]
const records = [
	{ draft: true, id: 'p1', published_at: '', title: 'Autumn blend' },
	{ draft: false, id: 'p2', published_at: '2020-01-02 03:04:00.000Z', title: '' },
] as unknown as RecordModel[]

/**
The query and the options of the last navigation.
*/
function lastNavigation() {
	const [url, options] = navigation.goto.mock.lastCall as [string, object]
	expect(url).toContain('/collections/posts')
	return { options, query: parseListQuery(url) }
}

function list(query: Partial<ListQuery> = {}, items = records, totalPages = 1): List {
	return {
		model: buildListModel(config, schema[0], 'en'),
		query: { page: 1, search: '', sort: '', status: '', ...query },
		result: { items, page: query.page ?? 1, perPage: 30, totalItems: items.length, totalPages },
	}
}

function show(value: List = list()) {
	return render(RecordList, { collection: 'posts', config, label: 'Posts', list: value, schema })
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
	vi.useRealTimers()
	vi.clearAllMocks()
})

describe('RecordList', () => {
	it('shows a table with the title linking to the record', () => {
		show()

		const table = screen.getByRole('table', { name: 'Posts' })
		const rows = within(table).getAllByRole('row')
		expect(rows).toHaveLength(3)
		expect(within(rows[1]).getByRole('link', { name: 'Autumn blend' })).toHaveAttribute(
			'href',
			expect.stringMatching(/#\/collections\/posts\/p1$/),
		)
		expect(rows[1]).toHaveTextContent('Draft')
		expect(within(rows[2]).getByRole('link', { name: '(Untitled)' })).toBeInTheDocument()
		expect(rows[2]).toHaveTextContent('Published')
	})

	it('searches shortly after typing stops, from the first page', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		show(list({ page: 2, status: 'draft' }, records, 3))

		await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'bean')
		expect(navigation.goto).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(300)

		expect(navigation.goto).toHaveBeenCalledTimes(1)
		expect(lastNavigation()).toEqual({
			options: { replace: true, reset: false },
			query: { page: 1, search: 'bean', sort: '', status: 'draft' },
		})
	})

	it('waits for an input method to finish composing', async () => {
		show()
		const input = screen.getByRole('searchbox')

		await fireEvent.input(input, { isComposing: true, target: { value: 'こうひ' } })
		await vi.advanceTimersByTimeAsync(1000)
		expect(navigation.goto).not.toHaveBeenCalled()

		await fireEvent.input(input, { target: { value: 'コーヒー' } })
		await fireEvent.compositionEnd(input)
		await vi.advanceTimersByTimeAsync(300)
		expect(lastNavigation().query.search).toBe('コーヒー')
	})

	it('keeps what is being typed when the earlier search arrives, and follows the URL otherwise', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		const view = show()
		const input = screen.getByRole('searchbox')

		await user.type(input, 'be')
		await vi.advanceTimersByTimeAsync(300)
		await user.type(input, 'an')
		await view.rerender({ list: list({ search: 'be' }) })
		expect(input).toHaveValue('bean')
		await vi.advanceTimersByTimeAsync(300)
		expect(lastNavigation().query.search).toBe('bean')

		await view.rerender({ list: list({ search: 'bean' }) })
		// Back in the browser.
		await view.rerender({ list: list() })
		expect(input).toHaveValue('')
	})

	it('sorts by a date column, newest first and then oldest first', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		const view = show()
		const header = screen.getByRole('columnheader', { name: 'published_at' })
		expect(header).toHaveAttribute('aria-sort', 'descending')
		expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(1)

		await user.click(within(header).getByRole('button'))
		expect(lastNavigation().query.sort).toBe('published_at')

		await view.rerender({ list: list({ sort: 'published_at' }) })
		expect(header).toHaveAttribute('aria-sort', 'ascending')
		await user.click(within(header).getByRole('button'))
		expect(lastNavigation().query.sort).toBe('-published_at')
	})

	it('moves between pages, adding to the history', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		show(list({ page: 2 }, records, 3))
		const pagination = screen.getByRole('navigation', { name: 'Pagination' })
		expect(pagination).toHaveTextContent('Page 2 of 3')

		await user.click(within(pagination).getByRole('button', { name: 'Next' }))

		expect(lastNavigation()).toMatchObject({ options: {}, query: { page: 3 } })
	})

	it('has no page buttons for a single page', () => {
		show()

		expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
	})

	it('offers to clear a search and a filter that match nothing', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		show(list({ search: 'zzz', status: 'draft' }, []))
		expect(screen.getByRole('status')).toHaveTextContent('No records match.')
		expect(screen.queryByRole('table')).not.toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'Clear search and filter' }))

		expect(lastNavigation().query).toEqual({ page: 1, search: '', sort: '', status: '' })
		expect(screen.getByRole('searchbox')).toHaveValue('')
	})

	it('says when there are no records yet', () => {
		show(list({}, []))

		expect(screen.getByRole('status')).toHaveTextContent('There are no records yet.')
		expect(screen.queryByRole('button', { name: 'Clear search and filter' })).not.toBeInTheDocument()
	})

	it('drops a pending search when the user goes elsewhere', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		show()

		await user.type(screen.getByRole('searchbox'), 'x')
		const [leave] = navigation.beforeNavigate.mock.calls[0] as [() => void]
		leave()
		await vi.advanceTimersByTimeAsync(300)

		expect(navigation.goto).not.toHaveBeenCalled()
	})
})
