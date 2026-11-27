// Images are made smaller in the browser before they are uploaded (decision 39): PocketBase's JS
// hooks cannot process images, so doing it here keeps the JS and Go setups the same.
import type { CompressConfig } from '#lib/config/index.js'

export interface CompressOptions {
	format: 'jpeg' | 'keep' | 'webp'
	maxWidth: number
	/**
	From 0 to 1, as `canvas.toBlob` takes it.
	*/
	quality: number
}

export interface DecodedImage {
	height: number
	source?: CanvasImageSource
	width: number
}

/**
How to draw and encode an image; replaced in tests, where there is no canvas.
*/
export interface ImageCodec {
	decode: (file: File) => Promise<DecodedImage>
	encode: (image: DecodedImage, size: ImageSize, type: string, quality: number) => Promise<Blob | undefined>
}

export interface ImageSize {
	height: number
	width: number
}

export interface PreparedFile {
	file: File
	/**
	Set for images the browser could read.
	*/
	size?: ImageSize
}

export const defaultCompress: CompressOptions = { format: 'webp', maxWidth: 1920, quality: 0.85 }

// Types a canvas can write. Others, such as GIF (which may be animated) and SVG, are uploaded as they are.
const encodable = new Set(['image/jpeg', 'image/png', 'image/webp'])
// Types a canvas can read and that are worth re-encoding.
const decodable = new Set([...encodable, 'image/avif', 'image/bmp'])
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// The sizes of prepared images, for the fields that store them (decision 12).
const sizes = new WeakMap<File, ImageSize>()

export function compressOptions(config: CompressConfig | undefined): CompressOptions {
	return { ...defaultCompress, ...config }
}

/**
The size of an image made by `prepareFile`, or undefined for any other file.
*/
export function imageSize(file: File): ImageSize | undefined {
	return sizes.get(file)
}

/**
The type to encode an image as, or undefined to upload it as it is. `accepted` is the field's
`mimeTypes`; a type it refuses is avoided where another fits.
*/
export function outputType(
	inputType: string,
	format: CompressOptions['format'],
	accepted: string[] = [],
): string | undefined {
	if (!decodable.has(inputType)) return undefined
	const wanted = format === 'keep' ? (encodable.has(inputType) ? inputType : 'image/webp') : `image/${format}`
	if (accepted.length === 0 || accepted.includes(wanted)) return wanted
	if (encodable.has(inputType) && accepted.includes(inputType)) return inputType
	return ['image/webp', 'image/jpeg', 'image/png'].find(type => accepted.includes(type))
}

/**
A file ready to upload: an image no wider than `maxWidth`, in the configured format, with its size
remembered. Anything else, and an image that cannot be read, is returned as it is.
*/
export async function prepareFile(
	file: File,
	options: CompressOptions,
	{ accepted = [], codec = canvasCodec }: { accepted?: string[]; codec?: ImageCodec } = {},
): Promise<PreparedFile> {
	if (!file.type.startsWith('image/')) return { file }
	let image: DecodedImage
	try {
		image = await codec.decode(file)
	} catch {
		return { file }
	}

	const original = { height: image.height, width: image.width }
	const size = targetSize(original, options.maxWidth)
	const type = outputType(file.type, options.format, accepted)
	const isResized = size.width !== original.width
	// Nothing to gain from encoding again.
	if (type === undefined || (!isResized && options.format === 'keep' && type === file.type))
		return remember(file, original)

	let blob = await codec.encode(image, size, type, options.quality)
	// A browser that cannot write WebP writes PNG instead; JPEG is the smaller of the fallbacks.
	if (type === 'image/webp' && blob && blob.type !== type)
		blob = await codec.encode(image, size, 'image/jpeg', options.quality)
	if (!blob || !encodable.has(blob.type)) return remember(file, original)
	// Encoding the same type again at the same size can make a file larger.
	if (!isResized && blob.type === file.type && blob.size >= file.size) return remember(file, original)

	const prepared = new File([blob], renamed(file.name, blob.type), { lastModified: file.lastModified, type: blob.type })
	return remember(prepared, size)
}

/**
The file name with the extension of `type`.
*/
export function renamed(name: string, type: string): string {
	const extension = extensions[type]
	if (!extension) return name
	const dot = name.lastIndexOf('.')
	return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`
}

/**
The size an image is scaled down to: no wider than `maxWidth`, never larger than it was.
*/
export function targetSize({ height, width }: ImageSize, maxWidth: number): ImageSize {
	return width <= maxWidth
		? { height, width }
		: { height: Math.max(1, Math.round((height * maxWidth) / width)), width: maxWidth }
}

const canvasCodec: ImageCodec = {
	async decode(file) {
		const url = URL.createObjectURL(file)
		try {
			const image = new Image()
			image.src = url
			await image.decode()
			return { height: image.naturalHeight, source: image, width: image.naturalWidth }
		} finally {
			// The decoded image stays usable after its URL is revoked.
			URL.revokeObjectURL(url)
		}
	},
	encode(image, size, type, quality) {
		const canvas = document.createElement('canvas')
		canvas.width = size.width
		canvas.height = size.height
		const context = canvas.getContext('2d')
		if (!context || !image.source) return Promise.resolve(undefined)
		// JPEG has no transparency: transparent parts would turn black.
		if (type === 'image/jpeg') {
			context.fillStyle = '#ffffff'
			context.fillRect(0, 0, size.width, size.height)
		}
		context.imageSmoothingQuality = 'high'
		context.drawImage(image.source, 0, 0, size.width, size.height)
		return new Promise(done => {
			canvas.toBlob(blob => done(blob ?? undefined), type, quality)
		})
	},
}

function remember(file: File, size: ImageSize): PreparedFile {
	sizes.set(file, size)
	return { file, size }
}
