// WCAG 2.x contrast math on 6-digit hex colors, plus the sRGB mixing used to derive dark-mode accents.

export const white = '#ffffff'
export const black = '#111111'

export function contrastRatio(a: string, b: string): number {
	const x = luminance(a)
	const y = luminance(b)
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export function isHexColor(value: string): boolean {
	return /^#[\da-f]{6}$/i.test(value)
}

export function luminance(hex: string): number {
	const [r, g, b] = toRgb(hex).map(channel => {
		const v = channel / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
Linear interpolation in sRGB, like CSS `color-mix(in srgb, ...)`. `amount` is how much of `towards` to add.
*/
export function mix(hex: string, towards: string, amount: number): string {
	const from = toRgb(hex)
	const to = toRgb(towards)
	const channels = from.map((v, index) => Math.round(v + (to[index] - v) * amount))
	return '#' + channels.map(v => v.toString(16).padStart(2, '0')).join('')
}

/**
The text color, white or near-black, that reads better on `background`.
*/
export function pickForeground(background: string): string {
	return contrastRatio(background, white) >= contrastRatio(background, black) ? white : black
}

function toRgb(hex: string): number[] {
	const n = Number.parseInt(hex.slice(1), 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
