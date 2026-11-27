import type { RecordModel } from 'pocketbase'

import { describe, expect, it, vi } from 'vitest'

import type { MediaLibrary } from '#lib/media/library.js'

import { mediaFigure } from './images'

const library = {
	altField: 'alt',
	fields: { file: 'file', height: 'height', width: 'width' },
} as MediaLibrary
const url = 'https://cms.example.com/api/files/media/m1/cup.webp'

function record(values: Record<string, unknown>): RecordModel {
	return { collectionId: 'col_media', collectionName: 'media', id: 'm1', ...values } as RecordModel
}

describe('mediaFigure', () => {
	it('takes the size and alt text from the media record', async () => {
		const measure = vi.fn()

		const figure = await mediaFigure(
			library,
			record({ alt: 'Cup', file: 'cup.webp', height: 800, width: 1200 }),
			url,
			measure,
		)

		expect(figure).toEqual({ alt: 'Cup', height: 800, mediaId: 'm1', src: url, width: 1200 })
		expect(measure).not.toHaveBeenCalled()
	})

	it('measures the image when the record has no size', async () => {
		const measure = vi.fn(async () => ({ height: 30, width: 40 }))

		const figure = await mediaFigure(library, record({ file: 'cup.webp', width: 0 }), url, measure)

		expect(figure).toEqual({ alt: '', height: 30, mediaId: 'm1', src: url, width: 40 })
		expect(measure).toHaveBeenCalledWith(url)
	})

	it('inserts nothing for a record without a file', async () => {
		expect(await mediaFigure(library, record({ file: '' }), url, vi.fn())).toBeUndefined()
	})
})
