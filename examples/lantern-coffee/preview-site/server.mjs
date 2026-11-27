// A minimal preview page for the fictional Lantern Coffee site, with no dependencies. The CMS's
// "Preview on site" button posts `collection`, `id` and `token` here; the page reads that one draft
// from PocketBase with the token and shows it. See "Draft previews on your site" in the README.
//
//   node examples/lantern-coffee/preview-site/server.mjs
//
// PORT (default 3001) is where it listens, POCKETBASE_URL (default http://127.0.0.1:8090) where it
// reads from. It needs pbcms_preview.pb.js, and pbcms_media_urls.pb.js: the body is shown as the
// HTML the API returns, which that hook sanitizes.
import { createServer } from 'node:http'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Only what this site has pages for. Never build the API request from other values.
const collections = new Set(['about', 'posts'])
const recordId = /^[a-zA-Z0-9_-]{1,100}$/
const maxBodyLength = 10_000

/**
The preview site, not yet listening.

@param {string} pocketbaseUrl
*/
export function createPreviewServer(pocketbaseUrl) {
	return createServer(async (request, response) => {
		try {
			await handle(pocketbaseUrl, request, response)
		} catch (error) {
			console.error(error)
			if (!response.headersSent) send(response, 502, message('The preview could not be loaded.'))
		}
	})
}

/**
@param {unknown} [value]
*/
function escapeHtml(value = '') {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
}

/**
@param {string} pocketbaseUrl
@param {import('node:http').IncomingMessage} request
@param {import('node:http').ServerResponse} response
*/
async function handle(pocketbaseUrl, request, response) {
	if (request.url !== '/preview') return send(response, 404, message('Not found.'))
	if (request.method !== 'POST') return send(response, 405, message('Open the preview from the CMS.'))

	let body = ''
	request.setEncoding('utf8')
	for await (const chunk of request) {
		body += chunk
		if (body.length > maxBodyLength) return send(response, 413, message('The request is too large.'))
	}
	const form = new URLSearchParams(body)
	const collection = form.get('collection') ?? ''
	const id = form.get('id') ?? ''
	const token = form.get('token') ?? ''
	if (!collections.has(collection) || !recordId.test(id) || !/^[\w.-]+$/.test(token)) {
		return send(response, 400, message('Open the preview from the CMS.'))
	}

	const answer = await fetch(new URL(`/api/cms/preview/${collection}/${id}`, pocketbaseUrl), {
		headers: { Authorization: `Bearer ${token}` },
	})
	if (answer.status === 401) {
		return send(response, 401, message('This preview has expired. Open it again from the CMS.'))
	}
	if (!answer.ok) return send(response, answer.status, message('The preview could not be loaded.'))

	/**
	@type {{ body?: string, title?: string }}
	*/
	const record = await answer.json()
	send(response, 200, `<h1>${escapeHtml(record.title)}</h1>\n<article>${record.body ?? ''}</article>`)
}

/**
@param {string} text
*/
function message(text) {
	return `<p>${text}</p>`
}

/**
Drafts are never cached or indexed, and the page runs no scripts.

@param {import('node:http').ServerResponse} response
@param {number} status
@param {string} content
*/
function send(response, status, content) {
	response.writeHead(status, {
		'Cache-Control': 'no-store',
		'Content-Security-Policy': "default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'",
		'Content-Type': 'text/html; charset=utf-8',
		'X-Robots-Tag': 'noindex',
	})
	response.end(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview — Lantern Coffee</title>
<style>
body { max-width: 40rem; margin: 0 auto; padding: 1rem; font-family: system-ui, sans-serif; line-height: 1.7; }
img { max-width: 100%; height: auto; }
</style>
<p><strong>Preview</strong>: this page is not public.</p>
<main>
${content}
</main>
</html>
`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const port = Number(process.env.PORT ?? 3001)
	const pocketbaseUrl = process.env.POCKETBASE_URL ?? 'http://127.0.0.1:8090'
	createPreviewServer(pocketbaseUrl).listen(port, '127.0.0.1', () => {
		console.log(`Preview page at http://127.0.0.1:${port}/preview, reading from ${pocketbaseUrl}`)
	})
}
