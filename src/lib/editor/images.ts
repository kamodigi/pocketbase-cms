// Images inserted from the media library: `<img src data-media-id width height alt>` (decisions 12, 38).
import type { RecordModel } from 'pocketbase'

import type { MediaLibrary } from '#lib/media/library.js'

import { mediaFileName } from '#lib/media/library.js'

import type { FigureAttributes } from './extensions'

/**
Measures an image the browser can load; undefined when it cannot.
*/
export type MeasureImage = (url: string) => Promise<undefined | { height: number; width: number }>

/**
The figure to insert for a media record. `fileUrl` is the URL of its file. The size comes from the
record's width and height fields, or from the image itself when the record has none, so that every
inserted image has a width and height and the page does not jump while it loads.
*/
export async function mediaFigure(
	library: MediaLibrary,
	record: RecordModel,
	fileUrl: string,
	measure: MeasureImage = naturalSize,
): Promise<FigureAttributes | undefined> {
	if (!mediaFileName(library, record)) return undefined
	const alt: unknown = library.altField ? record[library.altField] : undefined
	const stored = { height: dimension(record, library.fields.height), width: dimension(record, library.fields.width) }
	const size = stored.width && stored.height ? stored : await measure(fileUrl)
	return {
		alt: typeof alt === 'string' ? alt : '',
		height: size?.height,
		mediaId: record.id,
		src: fileUrl,
		width: size?.width,
	}
}

/**
Loads the image to read its size.
*/
export async function naturalSize(url: string): Promise<undefined | { height: number; width: number }> {
	const image = new Image()
	image.src = url
	try {
		await image.decode()
	} catch {
		return undefined
	}
	return image.naturalWidth > 0 ? { height: image.naturalHeight, width: image.naturalWidth } : undefined
}

function dimension(record: RecordModel, field: string | undefined): number | undefined {
	const value: unknown = field ? record[field] : undefined
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}
