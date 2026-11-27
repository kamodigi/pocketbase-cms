// Link targets the editor accepts: the URL schemes the sanitizer keeps, and links within the site.

/**
The link as typed, trimmed, or undefined when the sanitizer would drop it or it is not a link at all.
A bare domain such as "example.com" is read as https.
*/
export function linkTarget(text: string): string | undefined {
	const href = text.trim()
	if (href === '' || /\s/.test(href)) return undefined
	if (/^(?:https?:\/\/[^/]|mailto:|tel:)/i.test(href)) return href
	if (/^[/#?]/.test(href) && !href.startsWith('//')) return href
	// No scheme: a domain, which needs a dot and nothing a scheme would have before it.
	if (/^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/.test(href)) return `https://${href}`
	return undefined
}
