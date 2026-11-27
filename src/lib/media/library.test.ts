import type { RecordModel } from 'pocketbase'

import { describe, expect, it } from 'vitest'

import type { CmsConfig, SchemaCollection } from '#lib/config/index.js'

import { defaultCompress, imageSize, prepareFile } from './compress'
import { mediaFields, mediaFileName, mediaLibrary, mediaMetadata, pickerThumb } from './library'

const config: CmsConfig = {
	collections: { media: { fields: { uploadedBy: { autofill: 'currentUser' } } }, posts: {} },
	media: {
		altField: 'alt',
		collection: 'media',
		compress: { maxWidth: 1200 },
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
			{ name: 'file', thumbs: ['480x0', '160x160f'], type: 'file' },
			{ name: 'alt', type: 'text' },
		],
		id: 'col_media',
		name: 'media',
	},
]

describe('mediaLibrary', () => {
	it('describes the media collection of the config', () => {
		expect(mediaLibrary(config, collections)).toEqual({
			altField: 'alt',
			autofill: [{ kind: 'currentUser', name: 'uploadedBy' }],
			captionField: undefined,
			collection: 'media',
			compress: { format: 'webp', maxWidth: 1200, quality: 0.85 },
			fields: { file: 'file', height: 'height', mime: 'mime', width: 'width' },
			file: collections[0]!.fields[0],
		})
	})

	it('is missing without a media config or a file field', () => {
		expect(mediaLibrary({ ...config, media: undefined }, collections)).toBeUndefined()
		expect(mediaLibrary({ ...config, media: { collection: 'media', fileField: 'alt' } }, collections)).toBeUndefined()
		expect(mediaLibrary(config, [])).toBeUndefined()
	})
})

describe('mediaFields', () => {
	it('is set for the media collection only', () => {
		expect(mediaFields(config, 'media')).toEqual({ file: 'file', height: 'height', mime: 'mime', width: 'width' })
		expect(mediaFields(config, 'posts')).toBeUndefined()
	})
})

describe('mediaFileName', () => {
	it('reads one name from a single or multiple file field', () => {
		const library = mediaLibrary(config, collections)!
		expect(mediaFileName(library, { file: 'a.webp' } as unknown as RecordModel)).toBe('a.webp')
		expect(mediaFileName(library, { file: ['b.webp'] } as unknown as RecordModel)).toBe('b.webp')
		expect(mediaFileName(library, { file: '' } as unknown as RecordModel)).toBeUndefined()
	})
})

describe('mediaMetadata', () => {
	it('gives the size and type of a prepared image', async () => {
		const codec = { decode: async () => ({ height: 30, width: 40 }), encode: async () => new Blob() }
		const { file } = await prepareFile(new File(['x'], 'a.gif', { type: 'image/gif' }), defaultCompress, { codec })
		expect(imageSize(file)).toEqual({ height: 30, width: 40 })
		expect(mediaMetadata({ file: 'file', height: 'h', mime: 'm', width: 'w' }, file)).toEqual({
			h: 30,
			m: 'image/gif',
			w: 40,
		})
		// Without the fields, and for a file whose size is unknown, nothing is filled.
		expect(mediaMetadata({ file: 'file' }, file)).toEqual({})
		expect(mediaMetadata({ file: 'file', width: 'w' }, new File(['x'], 'a.txt'))).toEqual({})
	})
})

describe('pickerThumb', () => {
	it('picks a thumbnail size that fits a tile', () => {
		expect(pickerThumb(collections[0]!.fields[0]!)).toBe('160x160f')
		expect(pickerThumb({ name: 'file', thumbs: ['960x0', '40x40'], type: 'file' })).toBe('100x100')
		expect(pickerThumb({ name: 'file', type: 'file' })).toBe('100x100')
	})
})
