/// <reference path="../pb_data/types.d.ts" />
// pocketbase-cms: sanitizes every `editor` (rich text) field before a record is saved through
// PocketBase (the API, the dashboard, or app.save() in hooks and migrations). It does not see
// records saved before it was installed, restored backups, raw SQL, or changes that a hook running
// after this one makes before it calls e.next(); pbcms_media_urls.pb.js sanitizes responses again
// for those. Needs pbcms/html.cjs next to this file.

/**
@param {core.RecordEvent} e
*/
function pbcmsSanitizeEditorFields(e) {
	const { MAX_HTML_LENGTH, sanitizeHtml } = require(`${__hooks}/pbcms/html.cjs`)
	const fields = e.record.collection().fields
	for (const field of fields) {
		if (field.type() !== 'editor') continue
		const name = field.getName()
		const html = e.record.getString(name)
		if (html.length > MAX_HTML_LENGTH) {
			throw new BadRequestError('The rich text is too long.', {
				[name]: new ValidationError('pbcms_html_too_long', `Must be at most ${MAX_HTML_LENGTH} characters.`),
			})
		}
		if (html !== '') e.record.set(name, sanitizeHtml(html))
	}
	e.next()
}

onRecordCreate(pbcmsSanitizeEditorFields)
onRecordUpdate(pbcmsSanitizeEditorFields)
