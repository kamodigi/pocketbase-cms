// The media library: the collection that `media` in the config names (decision 12). Image fields with
// `widget: "media"` pick from it, and an image uploaded to it saves its size and type with it.
import type { RecordModel } from 'pocketbase'

import type { CmsConfig, SchemaCollection, SchemaField } from '#lib/config/index.js'

import { compressOptions, type CompressOptions, imageSize } from './compress'

/**
The fields of the media library that the CMS fills when an image is uploaded.
*/
export interface MediaFields {
	file: string
	height?: string
	mime?: string
	width?: string
}

/**
What the image picker needs to show, search and add to the media library.
*/
export interface MediaLibrary {
	altField?: string
	/**
	Fields filled on create without being shown, as `autofill` in the media collection's fields says.
	*/
	autofill: { kind: 'currentUser' | 'now'; name: string }[]
	captionField?: string
	collection: string
	compress: CompressOptions
	fields: MediaFields
	/**
	The PocketBase definition of the file field, for its accepted types, size limit and thumbnails.
	*/
	file: SchemaField
}

// PocketBase makes this size for any file field, whatever its `thumbs` list says.
const fallbackThumb = '100x100'

/**
The fields `name`'s collection fills when an image is uploaded, if it is the media library.
*/
export function mediaFields(config: CmsConfig, name: string): MediaFields | undefined {
	const { media } = config
	return media?.collection === name
		? { file: media.fileField, height: media.heightField, mime: media.mimeField, width: media.widthField }
		: undefined
}

/**
The image's file name in a media record, or undefined when it has none.
*/
export function mediaFileName(library: MediaLibrary, record: RecordModel): string | undefined {
	const value: unknown = record[library.fields.file]
	const name: unknown = Array.isArray(value) ? value[0] : value
	return typeof name === 'string' && name !== '' ? name : undefined
}

/**
The media library, if the config has one and the schema has its collection with the file field.
*/
export function mediaLibrary(config: CmsConfig, collections: SchemaCollection[]): MediaLibrary | undefined {
	const { media } = config
	const fields = media && mediaFields(config, media.collection)
	const schema = collections.find(collection => collection.name === media?.collection)
	const file = schema?.fields.find(field => field.name === media?.fileField && field.type === 'file')
	if (!media || !fields || !file) return undefined
	const autofill = Object.entries(config.collections[media.collection]?.fields ?? {})
		.filter(([, field]) => field.autofill !== undefined)
		.map(([name, field]) => ({ kind: field.autofill!, name }))
	return {
		altField: media.altField,
		autofill,
		captionField: media.captionField,
		collection: media.collection,
		compress: compressOptions(media.compress),
		fields,
		file,
	}
}

/**
The values that go with a newly uploaded image: its width, height and type.
*/
export function mediaMetadata(fields: MediaFields, file: File): Record<string, unknown> {
	const size = imageSize(file)
	const values: Record<string, unknown> = {}
	if (size && fields.width) values[fields.width] = size.width
	if (size && fields.height) values[fields.height] = size.height
	if (file.type !== '' && fields.mime) values[fields.mime] = file.type
	return values
}

/**
The thumbnail to show in the picker's grid: one of the field's own sizes that fits a tile, or the size
PocketBase makes for every field.
*/
export function pickerThumb(field: SchemaField): string {
	const fits = (field.thumbs ?? []).find(thumb => {
		const match = /^(\d+)x(\d+)[bft]?$/.exec(thumb)
		if (!match) return false
		const [width, height] = [Number(match[1]), Number(match[2])]
		return width >= 120 && width <= 480 && height >= 120 && height <= 480
	})
	return fits ?? fallbackThumb
}
