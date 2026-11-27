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
// jsdom has no canvas: every image is read as 40 by 30, and its encoding fails, so it is uploaded as it is.
vi.mock('#lib/media/compress.js', async original => {
	const actual = await original<typeof import('#lib/media/compress.js')>()
	const codec = { decode: async () => ({ height: 30, width: 40 }), encode: async () => new Blob() }
	return {
		...actual,
		prepareFile: (file: File, options: never, extra: object = {}) =>
			actual.prepareFile(file, options, { ...extra, codec }),
	}
})

const config: CmsConfig = {
	collections: {
		media: { fields: { uploadedBy: { autofill: 'currentUser' } }, titleField: 'alt' },
		pages: {
			fields: {
				cover: { label: 'Cover', widget: 'media' },
				gallery: { label: 'Gallery', widget: 'media' },
				menu: { label: 'Menu' },
				photos: { label: 'Photos' },
			},
		},
	},
	media: {
		altField: 'alt',
		collection: 'media',
		fileField: 'file',
		heightField: 'height',
		mimeField: 'mime',
		widthField: 'width',
	},
	version: 1,
}
const collections: SchemaCollection[] = [
	{
		fields: [
			{ name: 'id', primaryKey: true, type: 'text' },
			{ name: 'title', type: 'text' },
			{ collectionId: 'col_media', maxSelect: 1, name: 'cover', type: 'relation' },
			{ collectionId: 'col_media', maxSelect: 2, name: 'gallery', type: 'relation' },
			{ maxSize: 1000, mimeTypes: ['application/pdf'], name: 'menu', type: 'file' },
			{ maxSelect: 3, name: 'photos', type: 'file' },
		],
		id: 'col_pages',
		name: 'pages',
	},
	{
		fields: [
			{ name: 'id', primaryKey: true, type: 'text' },
			{ name: 'file', thumbs: ['160x160f'], type: 'file' },
			{ name: 'alt', required: true, type: 'text' },
			{ name: 'width', type: 'number' },
			{ name: 'height', type: 'number' },
			{ name: 'mime', type: 'text' },
			{ collectionId: '_pb_users_auth_', maxSelect: 1, name: 'uploadedBy', type: 'relation' },
		],
		id: 'col_media',
		name: 'media',
	},
]
const images = [
	{
		alt: 'Harbor at dawn',
		collectionId: 'col_media',
		collectionName: 'media',
		file: 'harbor.webp',
		id: 'harbor000000001',
	},
	{
		alt: 'Cup on a table',
		collectionId: 'col_media',
		collectionName: 'media',
		file: 'cup.webp',
		id: 'cup000000000002',
	},
	{
		alt: 'Market stall',
		collectionId: 'col_media',
		collectionName: 'media',
		file: 'market.webp',
		id: 'market000000003',
	},
]

interface Write {
	body: Record<string, unknown>
	method: string
	url: string
}

function fileInput(container: HTMLElement, field: string): HTMLInputElement {
	return container.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(field)}"] input[type="file"]`)!
}

/**
A PocketBase with three images, searched by alt text; writes are recorded and echoed back.
*/
function serve() {
	const writes: Write[] = []
	const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
		const url = new URL(String(input), 'http://localhost')
		if (init?.method !== 'GET') {
			const body: Record<string, unknown> = {}
			if (init?.body instanceof FormData) {
				for (const [key, value] of init.body.entries()) {
					if (key === '@jsonPayload') Object.assign(body, JSON.parse(String(value)))
					else body[key] = [...((body[key] as undefined | unknown[]) ?? []), value]
				}
			} else {
				Object.assign(body, JSON.parse(String(init?.body)))
			}
			writes.push({ body, method: init?.method ?? '', url: url.pathname })
			// A single value is stored as it is; a file by its name.
			const saved = Object.fromEntries(
				Object.entries(body).map(([key, value]) => {
					const item: unknown = Array.isArray(value) && value.length === 1 ? value[0] : value
					return [key, item instanceof File ? item.name : item]
				}),
			)
			return Response.json({ collectionId: 'col_media', collectionName: 'media', id: 'new000000000004', ...saved })
		}
		const filter = url.searchParams.get('filter') ?? ''
		const search = /alt ~ "%(.*?)%"/.exec(filter)?.[1]
		const isById = filter.includes('id = ')
		const found = images.filter(image =>
			isById ? filter.includes(`"${image.id}"`) : search === undefined || image.alt.includes(search),
		)
		const page = Number(url.searchParams.get('page'))
		const perPage = isById ? found.length : 2
		return Response.json({
			items: found.slice((page - 1) * perPage, page * perPage),
			page,
			perPage,
			totalItems: found.length,
			totalPages: Math.ceil(found.length / perPage),
		})
	})
	vi.stubGlobal('fetch', fetch)
	return writes
}

function show(record?: Record<string, unknown>) {
	return render(RecordForm, {
		collection: 'pages',
		collections,
		config,
		label: 'Pages',
		record: record as RecordModel | undefined,
		schema: collections[0]!,
		uiLocale: 'en',
	})
}

beforeEach(() => {
	pb.authStore.save('token', { collectionId: 'c', collectionName: 'users', id: 'u1', role: 'editor' })
	URL.createObjectURL = vi.fn(() => 'blob:preview')
	URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
	localStorage.clear()
})

describe('a media field', () => {
	it('picks an image from the library by its alt text', async () => {
		const user = userEvent.setup()
		const writes = serve()
		show()

		await user.click(screen.getByRole('button', { name: 'Choose Cover' }))
		const dialog = await screen.findByRole('dialog', { name: 'Choose Cover' })
		const harbor = await within(dialog).findByRole('button', { name: 'Harbor at dawn' })
		expect(harbor.querySelector('img')).toHaveAttribute(
			'src',
			expect.stringContaining('/api/files/col_media/harbor000000001/harbor.webp?thumb=160x160f'),
		)
		await user.click(within(dialog).getByRole('button', { name: 'Show more' }))
		await user.click(await within(dialog).findByRole('button', { name: 'Market stall' }))

		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
		expect(screen.getByRole('button', { name: 'Remove Market stall' })).toBeInTheDocument()
		await user.click(screen.getByRole('button', { name: 'Create' }))
		await waitFor(() => expect(writes.at(-1)?.body).toMatchObject({ cover: 'market000000003', gallery: [] }))
	})

	it('uploads a new image with its alt text, size and uploader, and chooses it', async () => {
		const user = userEvent.setup()
		const writes = serve()
		show({ collectionId: 'col_pages', collectionName: 'pages', cover: '', gallery: ['cup000000000002'], id: 'p1' })

		expect(await screen.findByRole('button', { name: 'Remove Cup on a table' })).toBeInTheDocument()
		await user.click(screen.getByRole('button', { name: 'Choose Gallery' }))
		const dialog = await screen.findByRole('dialog', { name: 'Choose Gallery' })
		const upload = within(dialog).getByRole('form', { name: 'Upload a new image' })

		// Both the image and its alt text are needed.
		await user.click(within(upload).getByRole('button', { name: 'Upload' }))
		expect(within(upload).getByRole('alert')).toHaveTextContent('Choose an image to upload.')
		const alt = within(upload).getByRole('textbox', { name: /^Alt text/ })
		expect(alt).toHaveAttribute('aria-invalid', 'true')
		expect(writes).toEqual([])

		const photo = new File(['png'], 'Lantern.png', { type: 'image/png' })
		await user.upload(upload.querySelector<HTMLInputElement>('input[type="file"]')!, photo)
		await user.type(alt, 'A lantern by the door')
		await user.click(within(upload).getByRole('button', { name: 'Upload' }))

		await waitFor(() => expect(writes).toHaveLength(1))
		expect(writes[0]).toMatchObject({
			// Text and numbers go as form fields beside the file.
			body: { alt: ['A lantern by the door'], height: ['30'], mime: ['image/png'], uploadedBy: ['u1'], width: ['40'] },
			method: 'POST',
			url: '/api/collections/media/records',
		})
		expect((writes[0]!.body.file as File[])[0]).toMatchObject({ name: 'Lantern.png' })
		expect(
			await within(dialog).findByRole('button', { name: 'A lantern by the door', pressed: true }),
		).toBeInTheDocument()
		await expect(dialog).toHaveAccessibleDescription('2 of up to 2 chosen')
		// The gallery is full: there is nothing more to upload into it.
		expect(within(dialog).queryByRole('form', { name: 'Upload a new image' })).not.toBeInTheDocument()

		await user.keyboard('{Escape}')
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
		await user.click(screen.getByRole('button', { name: 'Save' }))
		await waitFor(() => expect(writes.at(-1)?.body).toEqual({ gallery: ['cup000000000002', 'new000000000004'] }))
	})
})

describe('a file field', () => {
	it('shows the stored files, and replaces and removes them on save', async () => {
		const user = userEvent.setup()
		const writes = serve()
		const { container } = show({
			collectionId: 'col_pages',
			collectionName: 'pages',
			gallery: [],
			id: 'p1',
			menu: 'menu.pdf',
			photos: ['a.png', 'b.png'],
		})

		expect(screen.getByRole('link', { name: 'menu.pdf' })).toHaveAttribute(
			'href',
			expect.stringContaining('/api/files/col_pages/p1/menu.pdf'),
		)
		const replace = screen.getByRole('button', { name: 'Replace the file of Menu' })

		// A file the field refuses is not taken.
		await user.upload(
			fileInput(container, 'menu'),
			new File(['x'.repeat(2000)], 'big.pdf', { type: 'application/pdf' }),
		)
		expect(await screen.findByText('big.pdf is larger than 1,000 byte.')).toBeInTheDocument()
		await user.upload(fileInput(container, 'menu'), new File(['%PDF'], 'autumn.pdf', { type: 'application/pdf' }))
		expect(await screen.findByText('autumn.pdf')).toBeInTheDocument()
		expect(screen.queryByText('menu.pdf')).not.toBeInTheDocument()
		expect(replace).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'Remove a.png' }))
		expect(screen.getByRole('button', { name: 'Add files to Photos' })).toHaveFocus()
		await user.upload(fileInput(container, 'photos'), [
			new File(['1'], 'c.png', { type: 'image/png' }),
			new File(['2'], 'd.png', { type: 'image/png' }),
			new File(['3'], 'e.png', { type: 'image/png' }),
		])
		// Three at most: the last one is left out.
		expect(await screen.findByText('Up to 3 files.')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Add files to Photos' })).toBeDisabled()

		await user.click(screen.getByRole('button', { name: 'Save' }))
		await waitFor(() => expect(writes).toHaveLength(1))
		const { body, method } = writes[0]!
		expect(method).toBe('PATCH')
		expect(new Set(Object.keys(body))).toEqual(new Set(['menu', 'photos+', 'photos-']))
		expect((body.menu as File[])[0]).toMatchObject({ name: 'autumn.pdf' })
		expect((body['photos+'] as File[]).map(file => file.name)).toEqual(['c.png', 'd.png'])
		expect(body['photos-']).toEqual(['a.png'])
	})
})
