// TypeScript shape of cms.config.json. schema/cms.config.schema.json is the source of truth: change it
// first, then mirror the change here. validate.test.ts checks that the enum lists below match it.

export interface BrandConfig {
	accent?: string
	favicon?: string
	logo?: string
	name?: Label
}

export interface CmsConfig {
	$schema?: string
	brand?: BrandConfig
	collections: Record<string, CollectionConfig>
	editor?: EditorConfig
	/**
	Content locales for localized fields. The first one is the base locale.
	*/
	locales?: string[]
	media?: MediaConfig
	nav?: NavGroup[]
	version: 1
}

export interface CollectionConfig {
	fields?: Record<string, FieldConfig>
	form?: FormLayout
	icon?: string
	label?: Label
	list?: ListConfig
	previewUrl?: string
	singleton?: boolean
	status?: StatusConfig
	titleField?: string
}

export interface CompressConfig {
	format?: 'jpeg' | 'keep' | 'webp'
	maxWidth?: number
	quality?: number
}

export interface EditorConfig {
	features?: EditorFeature[]
	headingLevels?: HeadingLevel[]
}

export type EditorFeature = (typeof editorFeatures)[number]

export interface FieldConfig {
	autofill?: 'currentUser' | 'now'
	badge?: Label
	displayField?: string
	editor?: EditorConfig
	help?: Label
	hidden?: boolean
	label?: Label
	/**
	Groups `<name>_<locale>` fields into one input with locale tabs.
	*/
	localized?: boolean
	options?: Record<string, Label>
	readonly?: boolean
	slugFrom?: string
	widget?: Widget
}

export interface FormLayout {
	main?: string[]
	side?: string[]
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/**
A plain string, or one string per UI locale.
*/
export type Label = Record<string, string> | string

export interface ListConfig {
	/**
	Field names, plus the virtual column `$status`.
	*/
	columns?: string[]
	perPage?: number
	search?: string[]
	sort?: string
}

export interface MediaConfig {
	altField?: string
	captionField?: string
	collection: string
	compress?: CompressConfig
	fileField: string
	heightField?: string
	mimeField?: string
	widthField?: string
}

export interface NavGroup {
	items: string[]
	label?: Label
}

/**
Exactly one of `draftField` and `publishedField` is set.
*/
export type StatusConfig =
	| { draftField: string; publishedAtField?: string; publishedField?: undefined }
	| { draftField?: undefined; publishedAtField?: string; publishedField: string }

export type Widget = (typeof widgets)[number]

export const editorFeatures = [
	'heading',
	'bold',
	'italic',
	'underline',
	'strike',
	'code',
	'link',
	'bulletList',
	'orderedList',
	'blockquote',
	'codeBlock',
	'horizontalRule',
	'image',
	'table',
	'textColor',
	'textAlign',
] as const

export const widgets = [
	'text',
	'textarea',
	'slug',
	'richtext',
	'number',
	'toggle',
	'date',
	'datetime',
	'url',
	'select',
	'checkboxes',
	'relation',
	'media',
	'file',
] as const

/**
The virtual list column that shows Draft / Scheduled / Published.
*/
export const statusColumn = '$status'
