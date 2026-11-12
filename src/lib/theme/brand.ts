import { black, contrastRatio, isHexColor, mix, pickForeground, white } from './contrast'

/**
The brand accent turned into the six CSS variables layout.css declares, for light and dark paper.
Dark values are lightened the same way layout.css does for the default accent.
*/
export interface BrandTokens {
	'--brand': string
	'--brand-dark': string
	'--brand-dark-fg': string
	'--brand-fg': string
	'--brand-text': string
	'--brand-text-dark': string
}

export interface ContrastWarning {
	/**
	Which part of the UI falls short.
	*/
	kind: 'button' | 'ui'
	mode: 'dark' | 'light'
	ratio: number
	/**
	The minimum the ratio should reach: 4.5 for text, 3 for UI shapes (WCAG 2.2 AA).
	*/
	required: number
}

// The paper colors the accent sits on (see layout.css). Kept here as literals; brand.test.ts compares them with the CSS.
// Link text must read on the whole range of surfaces: the page background, and the accent (nav-active) fill.
export const paper = {
	darkBackground: '#151411',
	darkSurface: '#2b2822',
	lightBackground: '#fbfaf7',
	lightSurface: '#ebe8e1',
} as const

/**
Applies `brand.accent` to the document. An invalid or missing color leaves the defaults from layout.css.
*/
export function applyAccent(accent: string | undefined, root: HTMLElement = document.documentElement): void {
	if (accent === undefined || !isHexColor(accent)) return
	const tokens = brandTokens(accent.toLowerCase())
	for (const name of Object.keys(tokens) as (keyof BrandTokens)[]) {
		root.style.setProperty(name, tokens[name])
	}
}

export function brandTokens(accent: string): BrandTokens {
	const dark = mix(accent, white, 0.18)
	return {
		'--brand': accent,
		'--brand-dark': dark,
		'--brand-dark-fg': pickForeground(dark),
		'--brand-fg': pickForeground(accent),
		// Link text is nudged until it reads on every surface, so a pale accent never makes unreadable links.
		'--brand-text': readable(accent, paper.lightSurface, black),
		'--brand-text-dark': readable(dark, paper.darkSurface, white),
	}
}

/**
Checks the accent against WCAG 2.2 AA where it is used as a fill: the button label (4.5:1), and the button and
focus-ring shape against the page (3:1). Link text is not checked because brandTokens adjusts it.
A failing label is rare, since its color is picked for contrast; the shape check fails for pale accents.
*/
export function checkContrast(accent: string): ContrastWarning[] {
	const tokens = brandTokens(accent)
	const checks: ContrastWarning[] = [
		{ kind: 'button', mode: 'light', ratio: contrastRatio(tokens['--brand'], tokens['--brand-fg']), required: 4.5 },
		{
			kind: 'button',
			mode: 'dark',
			ratio: contrastRatio(tokens['--brand-dark'], tokens['--brand-dark-fg']),
			required: 4.5,
		},
		{ kind: 'ui', mode: 'light', ratio: contrastRatio(tokens['--brand'], paper.lightBackground), required: 3 },
		{ kind: 'ui', mode: 'dark', ratio: contrastRatio(tokens['--brand-dark'], paper.darkBackground), required: 3 },
	]
	return checks
		.filter(check => check.ratio < check.required)
		.map(check => ({ ...check, ratio: Math.round(check.ratio * 10) / 10 }))
}

/**
Moves `color` towards `towards` in 5% steps until it reaches 4.5:1 on `background`.
*/
function readable(color: string, background: string, towards: string): string {
	for (let amount = 0; amount <= 1; amount += 0.05) {
		const candidate = mix(color, towards, amount)
		if (contrastRatio(candidate, background) >= 4.5) return candidate
	}
	return towards
}
