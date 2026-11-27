import type { RelationTarget } from '#lib/relation/target.js'

// What the rich text editor of one field offers: the `editor` settings of the config, where a field's
// own settings replace the config-wide ones key by key.
import { type EditorConfig, type EditorFeature, editorFeatures, type HeadingLevel } from '#lib/config/index.js'

export interface EditorSettings {
	features: ReadonlySet<EditorFeature>
	/**
	The heading levels offered, in order. Empty when headings are off.
	*/
	headingLevels: HeadingLevel[]
	/**
	The media library that images are inserted from. Set only when the `image` feature is on.
	*/
	images?: RelationTarget
}

/**
Headings when the config names none: the page's own title is usually the only `<h1>`.
*/
export const defaultHeadingLevels: HeadingLevel[] = [2, 3, 4]

/**
The settings of one field. Without `features`, every feature is on. Images need the media library,
so they are off without one.
*/
export function editorSettings(
	shared: EditorConfig | undefined,
	own: EditorConfig | undefined,
	images: RelationTarget | undefined,
): EditorSettings {
	const listed = own?.features ?? shared?.features
	const features = new Set<EditorFeature>(listed ?? editorFeatures)
	if (!images) features.delete('image')
	const levels = own?.headingLevels ?? shared?.headingLevels ?? defaultHeadingLevels
	const headingLevels = features.has('heading') ? [...new Set(levels)].toSorted((a, b) => a - b) : []
	if (headingLevels.length === 0) features.delete('heading')
	return { features, headingLevels, images: features.has('image') ? images : undefined }
}
