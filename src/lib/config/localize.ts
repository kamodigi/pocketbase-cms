import type { Label } from './types'

/**
The PocketBase field that holds one locale of a localized field: `<base>_<locale>`, with the locale
lower-cased and hyphens turned into underscores (`title` + `zh-Hans` → `title_zh_hans`).
*/
export function localizedFieldName(base: string, locale: string): string {
	return `${base}_${locale.toLowerCase().replaceAll('-', '_')}`
}

/**
Resolves a config label for the UI locale: exact match, then the language subtag, then the first entry.
*/
export function resolveLabel(label: Label | undefined, uiLocale: string, fallback: string): string {
	if (label === undefined) return fallback
	if (typeof label === 'string') return label
	const language = uiLocale.split('-', 1)[0]
	return label[uiLocale] ?? (language ? label[language] : undefined) ?? Object.values(label)[0] ?? fallback
}
