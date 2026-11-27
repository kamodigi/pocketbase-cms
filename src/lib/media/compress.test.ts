import { describe, expect, it, vi } from 'vitest'

import {
	compressOptions,
	type DecodedImage,
	defaultCompress,
	type ImageCodec,
	imageSize,
	outputType,
	prepareFile,
	renamed,
	targetSize,
} from './compress'

/**
A codec without a canvas: images decode to the given size, and encoding writes `bytes` bytes of the
asked type, or of `writes` when set (a browser that cannot write that type).
*/
function fakeCodec({
	bytes = 10,
	height = 1500,
	width = 3000,
	writes,
}: Partial<DecodedImage> & { bytes?: number; writes?: string } = {}) {
	const encode = vi.fn<ImageCodec['encode']>(
		async (_image, _size, type) => new Blob(['x'.repeat(bytes)], { type: writes ?? type }),
	)
	const codec: ImageCodec = { decode: async () => ({ height, width }), encode }
	return { codec, encode }
}

function image(name: string, type: string): File {
	return new File(['x'.repeat(100)], name, { type })
}

describe('compressOptions', () => {
	it('fills what the config leaves out', () => {
		expect(compressOptions(undefined)).toEqual(defaultCompress)
		expect(compressOptions({ quality: 0.5 })).toEqual({ ...defaultCompress, quality: 0.5 })
	})
})

describe('targetSize', () => {
	it('scales a wide image down to the width, keeping its proportions', () => {
		expect(targetSize({ height: 1500, width: 3000 }, 1920)).toEqual({ height: 960, width: 1920 })
		expect(targetSize({ height: 1, width: 5000 }, 1920)).toEqual({ height: 1, width: 1920 })
	})

	it('never makes an image larger', () => {
		expect(targetSize({ height: 600, width: 800 }, 1920)).toEqual({ height: 600, width: 800 })
	})
})

describe('outputType', () => {
	it('follows the configured format', () => {
		expect(outputType('image/png', 'webp')).toBe('image/webp')
		expect(outputType('image/png', 'jpeg')).toBe('image/jpeg')
		expect(outputType('image/png', 'keep')).toBe('image/png')
		// A type a canvas cannot write is kept as an image the site can show.
		expect(outputType('image/avif', 'keep')).toBe('image/webp')
	})

	it('leaves alone what a canvas should not re-encode', () => {
		expect(outputType('image/gif', 'webp')).toBeUndefined()
		expect(outputType('image/svg+xml', 'webp')).toBeUndefined()
		expect(outputType('application/pdf', 'webp')).toBeUndefined()
	})

	it('picks a type the field accepts', () => {
		expect(outputType('image/png', 'webp', ['image/jpeg', 'image/png'])).toBe('image/png')
		expect(outputType('image/avif', 'webp', ['image/jpeg', 'image/avif'])).toBe('image/jpeg')
		expect(outputType('image/png', 'webp', ['image/gif'])).toBeUndefined()
	})
})

describe('renamed', () => {
	it('gives the name the extension of the new type', () => {
		expect(renamed('Harbor view.PNG', 'image/webp')).toBe('Harbor view.webp')
		expect(renamed('cup', 'image/jpeg')).toBe('cup.jpg')
		expect(renamed('.hidden', 'image/png')).toBe('.hidden.png')
		expect(renamed('cup.png', 'image/gif')).toBe('cup.png')
	})
})

describe('prepareFile', () => {
	it('scales a large image down, writes it as WebP and remembers its size', async () => {
		const { codec, encode } = fakeCodec()
		const { file, size } = await prepareFile(image('cup.png', 'image/png'), defaultCompress, { codec })

		expect(encode).toHaveBeenCalledWith(expect.anything(), { height: 960, width: 1920 }, 'image/webp', 0.85)
		expect(file).toMatchObject({ name: 'cup.webp', type: 'image/webp' })
		expect(size).toEqual({ height: 960, width: 1920 })
		expect(imageSize(file)).toEqual(size)
	})

	it('writes JPEG where the browser cannot write WebP', async () => {
		const { codec, encode } = fakeCodec({ writes: 'image/png' })
		encode.mockImplementationOnce(async () => new Blob(['png'], { type: 'image/png' }))
		encode.mockImplementationOnce(async (_image, _size, type) => new Blob(['jpeg'], { type }))
		const { file } = await prepareFile(image('cup.png', 'image/png'), defaultCompress, { codec })

		expect(encode.mock.calls.map(call => call[2])).toEqual(['image/webp', 'image/jpeg'])
		expect(file).toMatchObject({ name: 'cup.jpg', type: 'image/jpeg' })
	})

	it('keeps a small image as it is with `keep`', async () => {
		const { codec, encode } = fakeCodec({ height: 300, width: 400 })
		const original = image('cup.jpg', 'image/jpeg')
		const { file, size } = await prepareFile(original, { ...defaultCompress, format: 'keep' }, { codec })

		expect(encode).not.toHaveBeenCalled()
		expect(file).toBe(original)
		expect(size).toEqual({ height: 300, width: 400 })
	})

	it('keeps the original when encoding it again only makes it larger', async () => {
		const { codec } = fakeCodec({ bytes: 500, height: 300, width: 400 })
		const original = image('cup.webp', 'image/webp')
		const { file } = await prepareFile(original, defaultCompress, { codec })

		expect(file).toBe(original)
		expect(imageSize(file)).toEqual({ height: 300, width: 400 })
	})

	it('uploads GIFs, other files and unreadable images unchanged', async () => {
		const { codec, encode } = fakeCodec({ height: 10, width: 4000 })
		const gif = image('spin.gif', 'image/gif')
		const kept = await prepareFile(gif, defaultCompress, { codec })
		expect(kept.file).toBe(gif)
		expect(imageSize(gif)).toEqual({ height: 10, width: 4000 })

		const pdf = image('menu.pdf', 'application/pdf')
		expect(await prepareFile(pdf, defaultCompress, { codec })).toEqual({ file: pdf })

		const broken = image('broken.png', 'image/png')
		const failing: ImageCodec = { ...codec, decode: () => Promise.reject(new Error('not an image')) }
		expect(await prepareFile(broken, defaultCompress, { codec: failing })).toEqual({ file: broken })
		expect(encode).not.toHaveBeenCalled()
	})
})
