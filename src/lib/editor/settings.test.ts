import { describe, expect, it } from 'vitest'

import type { RelationTarget } from '#lib/relation/target.js'

import { editorFeatures } from '#lib/config/index.js'

import { editorSettings } from './settings'

const images = { collection: 'media' } as RelationTarget

describe('editorSettings', () => {
	it('turns every feature on, with headings 2 to 4, when the config says nothing', () => {
		const settings = editorSettings(undefined, undefined, images)

		expect([...settings.features]).toEqual([...editorFeatures])
		expect(settings.headingLevels).toEqual([2, 3, 4])
		expect(settings.images).toBe(images)
	})

	it("lets a field's own settings replace the shared ones key by key", () => {
		const settings = editorSettings(
			{ features: ['bold', 'heading', 'image'], headingLevels: [2] },
			{ headingLevels: [4, 3, 3] },
			images,
		)

		expect([...settings.features]).toEqual(['bold', 'heading', 'image'])
		expect(settings.headingLevels).toEqual([3, 4])
	})

	it('turns images off without a media library, and headings off without levels', () => {
		const settings = editorSettings({ headingLevels: [] }, undefined, undefined)

		expect(settings.features.has('image')).toBe(false)
		expect(settings.images).toBeUndefined()
		expect(settings.features.has('heading')).toBe(false)
		expect(settings.headingLevels).toEqual([])
	})

	it('offers no images or heading levels when those features are off', () => {
		const settings = editorSettings({ features: ['bold'] }, undefined, images)

		expect(settings.images).toBeUndefined()
		expect(settings.headingLevels).toEqual([])
	})
})
