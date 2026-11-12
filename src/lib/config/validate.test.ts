import { describe, expect, it } from 'vitest'

import schema from '../../../schema/cms.config.schema.json'
import blog from './fixtures/blog.json'
import directory from './fixtures/directory.json'
import multilingual from './fixtures/multilingual.json'
import { editorFeatures, widgets } from './types'
import { validateConfig } from './validate'

// Example presets added under examples/ are validated too.
const examples = import.meta.glob<{ default: unknown }>('/examples/**/cms.config.json', { eager: true })

const minimal = { collections: { posts: {} }, version: 1 }

function errorsOf(value: unknown) {
	const result = validateConfig(value)
	if (result.ok) throw new Error('expected the config to be invalid')
	return result.errors
}

describe('validateConfig', () => {
	it.each([
		['blog', blog],
		['directory', directory],
		['multilingual', multilingual],
		['minimal', minimal],
		...Object.entries(examples).map(([path, module]) => [path, module.default] as [string, unknown]),
	])('accepts the %s config', (_name, config) => {
		expect(validateConfig(config)).toEqual({ config, ok: true })
	})

	it('rejects a value that is not an object', () => {
		expect(errorsOf([])).toEqual([{ message: 'must be object', path: '' }])
	})

	it('reports missing required keys and a wrong version', () => {
		expect(errorsOf({ version: 2 })).toEqual([
			{ message: 'missing required key "collections"', path: '' },
			{ message: 'must be 1', path: '/version' },
		])
	})

	it('reports unknown keys with their path', () => {
		const config = { ...minimal, collections: { posts: { fields: { title: { lable: 'Title' } } } }, theme: 'dark' }
		expect(errorsOf(config)).toEqual([
			{ message: 'unknown key', path: '/theme' },
			{ message: 'unknown key', path: '/collections/posts/fields/title/lable' },
		])
	})

	it('lists the allowed values of an enum', () => {
		const config = { ...minimal, collections: { posts: { fields: { body: { widget: 'wysiwyg' } } } } }
		expect(errorsOf(config)).toEqual([
			{
				message: `must be one of ${widgets.map(w => `"${w}"`).join(', ')}`,
				path: '/collections/posts/fields/body/widget',
			},
		])
	})

	it('explains a bad label once instead of once per oneOf branch', () => {
		const config = { ...minimal, collections: { posts: { label: { ja: '' } } } }
		expect(errorsOf(config)).toEqual([
			{
				message: 'must be a non-empty string, or an object of non-empty strings keyed by locale',
				path: '/collections/posts/label',
			},
		])
	})

	it.each([
		['both', { draftField: 'draft', publishedField: 'published' }],
		['neither', { publishedAtField: 'published_at' }],
	])('requires exactly one status flag field (%s given)', (_name, status) => {
		expect(errorsOf({ ...minimal, collections: { posts: { status } } })).toEqual([
			{ message: 'must set exactly one of "draftField" and "publishedField"', path: '/collections/posts/status' },
		])
	})

	it('rejects a bad accent colour and a bad locale code', () => {
		const config = { ...minimal, brand: { accent: 'teal' }, locales: ['ja', 'English'] }
		expect(errorsOf(config).map(e => e.path)).toEqual(['/brand/accent', '/locales/1'])
	})

	it('rejects duplicate list entries', () => {
		const config = { ...minimal, editor: { headingLevels: [2, 3, 2] } }
		expect(errorsOf(config)).toEqual([
			{ message: 'must not list the same value twice (items 0 and 2)', path: '/editor/headingLevels' },
		])
	})

	it('rejects locales that map to the same field names', () => {
		const config = { ...minimal, locales: ['ja', 'zh-Hans', 'zh-hans'] }
		expect(errorsOf(config)).toEqual([{ message: 'uses the same field names as "zh-Hans"', path: '/locales/2' }])
	})

	it('reports references the schema cannot check', () => {
		const config = {
			collections: {
				pages: { fields: { title: { localized: true } }, previewUrl: 'javascript:alert(1)' },
				posts: { form: { main: ['title', 'body'], side: ['title'] }, list: { columns: ['title', '$status'] } },
			},
			media: { collection: 'files', fileField: 'file' },
			nav: [{ items: ['posts', 'pages', 'news'] }],
			version: 1,
		}
		expect(errorsOf(config)).toEqual([
			{ message: '"news" is not a key of "collections"', path: '/nav/0/items/2' },
			{ message: '"files" is not a key of "collections"', path: '/media/collection' },
			{ message: 'must be an absolute http or https URL', path: '/collections/pages/previewUrl' },
			{ message: 'needs "locales" at the top level', path: '/collections/pages/fields/title/localized' },
			{ message: '"$status" needs "status" on the collection', path: '/collections/posts/list/columns/1' },
			{ message: '"title" is also in "form.side"', path: '/collections/posts/form/main/0' },
		])
	})

	it('escapes keys that contain "/" in paths', () => {
		expect(errorsOf({ ...minimal, 'a/b': 1 })).toEqual([{ message: 'unknown key', path: '/a~1b' }])
	})
})

describe('types.ts', () => {
	it('lists the same widgets and editor features as the JSON Schema', () => {
		expect(widgets).toEqual(schema.$defs.field.properties.widget.enum)
		expect(editorFeatures).toEqual(schema.$defs.editor.properties.features.items.enum)
	})
})
