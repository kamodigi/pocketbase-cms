/// <reference path="../pb_data/types.d.ts" />
// pocketbase-cms: cleans `editor` (rich text) fields in API responses (including realtime and
// expand) and points every <img data-media-id="…"> at the current file of that `media` record, so
// a replaced file or a new domain never leaves stale image URLs in rich text. The stored HTML is not
// changed. Needs pbcms/html.cjs next to this file.
//
// Sanitizing again here covers HTML that never went through pbcms_sanitize.pb.js: records saved
// before the hooks were installed, restored backups, raw SQL, or a hook that changed the value
// after the sanitizer ran.
//
// File URLs start with PBCMS_PUBLIC_URL if set (e.g. https://pb.example.com), else the Application
// URL in PocketBase's settings. An image whose media record is gone, or not viewable by the
// requester, loses its src. HTML longer than MAX_HTML_LENGTH in html.cjs is returned empty.

onRecordEnrich(e => {
	const html = require(`${__hooks}/pbcms/html.cjs`)
	// More images than this in one record keep no src; real content stays far below it.
	const maxMediaIds = 200

	const values = {}
	const ids = new Set()
	const fields = e.record.collection().fields
	for (const field of fields) {
		if (field.type() !== 'editor') continue
		const name = field.getName()
		const value = e.record.getString(name)
		if (value === '') continue
		values[name] = value.length > html.MAX_HTML_LENGTH ? '' : html.sanitizeHtml(value)
		const found = html.findMediaIds(values[name])
		for (const id of found) {
			if (ids.size < maxMediaIds) ids.add(id)
		}
	}

	const media = ids.size === 0 ? undefined : findMediaCollection(e.app)
	const urls = {}
	if (media) {
		const baseUrl = html.publicBaseUrl($os.getenv('PBCMS_PUBLIC_URL'), e.app.settings().meta.appURL)
		const records = e.app.findRecordsByIds(media, [...ids])
		for (const record of records) {
			if (!e.requestInfo || !e.app.canAccessRecord(record, e.requestInfo, media.viewRule)) continue
			const filename = record.getString('file')
			if (filename !== '') urls[record.id] = html.fileUrl(baseUrl, media.id, record.id, filename)
		}
	}

	for (const [name, value] of Object.entries(values)) {
		e.record.set(name, media ? html.rewriteMediaSrc(value, urls) : value)
	}
	return e.next()

	/**
	The `media` collection with a `file` field, or undefined if the site has none.
	*/
	function findMediaCollection(app) {
		let collection
		try {
			collection = app.findCachedCollectionByNameOrId('media')
		} catch {
			return
		}
		return collection.fields.getByName('file') ? collection : undefined
	}
})
