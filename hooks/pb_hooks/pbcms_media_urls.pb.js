/// <reference path="../pb_data/types.d.ts" />
// pocketbase-cms: in API responses (including realtime and expand), points every
// <img data-media-id="…"> in an `editor` field at the current file of that `media` record, so a
// replaced file or a new domain never leaves stale image URLs in rich text. The stored HTML is not
// changed. Needs pbcms/html.cjs next to this file.
//
// File URLs start with PBCMS_PUBLIC_URL if set (e.g. https://pb.example.com), else the Application
// URL in PocketBase's settings. Only media records the requester may view are resolved.

onRecordEnrich(e => {
	const html = require(`${__hooks}/pbcms/html.cjs`)

	const fields = []
	const ids = new Set()
	for (const field of e.record.collection().fields) {
		if (field.type() !== 'editor') continue
		const name = field.getName()
		const found = html.findMediaIds(e.record.getString(name))
		if (found.length === 0) continue
		fields.push(name)
		for (const id of found) ids.add(id)
	}
	if (fields.length === 0) return e.next()

	let media
	try {
		media = e.app.findRecordsByIds('media', [...ids])
	} catch {
		// No media collection: leave the HTML as it is.
		return e.next()
	}

	const baseUrl = html.publicBaseUrl($os.getenv('PBCMS_PUBLIC_URL'), e.app.settings().meta.appURL)
	const urls = {}
	for (const record of media) {
		if (!e.requestInfo || !e.app.canAccessRecord(record, e.requestInfo, record.collection().viewRule)) continue
		const filename = record.getString('file')
		if (filename !== '') urls[record.id] = html.fileUrl(baseUrl, record.collection().id, record.id, filename)
	}
	for (const name of fields) e.record.set(name, html.rewriteMediaSrc(e.record.getString(name), urls))

	return e.next()
})
