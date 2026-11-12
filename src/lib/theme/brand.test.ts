import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { applyAccent, brandTokens, checkContrast, paper } from './brand'
import { contrastRatio, isHexColor, mix, pickForeground } from './contrast'

const css = readFileSync(path.join(process.cwd(), 'src/routes/layout.css'), 'utf8')

function cssVariable(name: string): string | undefined {
	return new RegExp(String.raw`${name}:\s*([^;]+);`).exec(css)?.[1]
}

describe('contrast math', () => {
	it('matches known WCAG ratios', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
		// Hand-computed: relative luminance of #0a7f99 is about 0.1754, so 1.05 / (0.1754 + 0.05) is about 4.66.
		expect(contrastRatio('#0a7f99', '#ffffff')).toBeCloseTo(4.66, 2)
	})

	it('picks the more readable text color', () => {
		expect(pickForeground('#0a7f99')).toBe('#ffffff')
		expect(pickForeground('#f5c400')).toBe('#111111')
	})

	it('mixes in sRGB like color-mix', () => {
		expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
		expect(mix('#0a7f99', '#ffffff', 0)).toBe('#0a7f99')
	})

	it('recognises 6-digit hex colors only', () => {
		expect(isHexColor('#0A7f99')).toBe(true)
		expect(isHexColor('#fff')).toBe(false)
		expect(isHexColor('teal')).toBe(false)
	})
})

describe('default accent', () => {
	it('is the turquoise from the design decisions, and passes every check', () => {
		expect(cssVariable('--brand')).toBe('#0a7f99')
		expect(checkContrast('#0a7f99')).toEqual([])
	})

	it('has CSS defaults equal to what brandTokens computes', () => {
		const tokens = brandTokens('#0a7f99')
		for (const [name, value] of Object.entries(tokens)) {
			expect(cssVariable(name), name).toBe(value)
		}
	})

	it('keeps links readable on every surface in both modes', () => {
		const tokens = brandTokens('#0a7f99')
		expect(contrastRatio(tokens['--brand-text'], paper.lightSurface)).toBeGreaterThanOrEqual(4.5)
		expect(contrastRatio(tokens['--brand-text'], paper.lightBackground)).toBeGreaterThanOrEqual(4.5)
		expect(contrastRatio(tokens['--brand-text-dark'], paper.darkSurface)).toBeGreaterThanOrEqual(4.5)
	})
})

describe('paper literals used for the contrast checks', () => {
	it('match layout.css', () => {
		expect(cssVariable('--paper-50')).toBe(paper.lightBackground)
		expect(cssVariable('--paper-200')).toBe(paper.lightSurface)
		expect(cssVariable('--paper-650')).toBe(paper.darkSurface)
		expect(cssVariable('--paper-900')).toBe(paper.darkBackground)
	})
})

describe('checkContrast', () => {
	it('warns that a pale accent is too faint as a button and focus ring on light paper', () => {
		const warnings = checkContrast('#f5c400')
		expect(warnings).toEqual([expect.objectContaining({ kind: 'ui', mode: 'light', required: 3 })])
	})

	it('warns about a very dark accent on dark paper', () => {
		// Lightening by 18% is not enough for near-black accents.
		expect(checkContrast('#101820').some(w => w.mode === 'dark')).toBe(true)
	})

	it('accepts a readable accent', () => {
		expect(checkContrast('#2f6b55')).toEqual([])
	})

	it('still gives a pale accent readable link text', () => {
		const tokens = brandTokens('#f5c400')
		expect(contrastRatio(tokens['--brand-text'], paper.lightSurface)).toBeGreaterThanOrEqual(4.5)
	})
})

describe('applyAccent', () => {
	it('sets the brand variables', () => {
		const root = document.createElement('div')
		applyAccent('#F5C400', root)

		expect(root.style.getPropertyValue('--brand')).toBe('#f5c400')
		expect(root.style.getPropertyValue('--brand-fg')).toBe('#111111')
	})

	it('does nothing without an accent or with an invalid one', () => {
		const root = document.createElement('div')
		applyAccent(undefined, root)
		applyAccent('teal', root)
		expect(root.style.getPropertyValue('--brand')).toBe('')
	})
})
