import type PocketBase from 'pocketbase'

export interface PreviewTarget {
	collection: string
	id: string
	/**
	The collection's `previewUrl`: the site's page that receives the form.
	*/
	url: string
}

/**
Opens a record's preview on the site in a new tab: gets a preview token for it, then sends
`collection`, `id` and `token` to the site as a form POST, so that the token never shows in a URL.
Answers "blocked" when the browser did not let the tab open.
*/
export async function openPreview(
	client: PocketBase,
	{ collection, id, url }: PreviewTarget,
): Promise<'blocked' | 'opened'> {
	// Opened before the request: browsers only allow a new tab while they handle the click.
	const tab = window.open('', '_blank')
	if (!tab) return 'blocked'
	// The site's page must not be able to reach back into the CMS.
	// eslint-disable-next-line unicorn/no-null -- null is what cuts the opener off
	tab.opener = null

	let token: string
	try {
		const path = `/api/cms/preview/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/token`
		const answer = await client.send<{ token: string }>(path, { method: 'POST' })
		token = answer.token
	} catch (error) {
		tab.close()
		throw error
	}
	// The user closed the tab while waiting.
	if (!tab.closed) submitForm(tab.document, url, { collection, id, token })
	return 'opened'
}

function submitForm(page: Document, action: string, values: Record<string, string>) {
	const form = page.createElement('form')
	form.method = 'post'
	form.action = action
	for (const [name, value] of Object.entries(values)) {
		const input = page.createElement('input')
		input.type = 'hidden'
		input.name = name
		input.value = value
		form.append(input)
	}
	page.body.append(form)
	form.submit()
}
