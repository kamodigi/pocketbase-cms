/// <reference path="../pb_data/types.d.ts" />
// pocketbase-cms: sanitizes every `editor` (rich text) field before a record is saved.
// It runs on every save, so HTML sent straight to the API, through the dashboard or from other
// hooks is cleaned too. Needs pbcms/html.cjs next to this file.

/**
@param {core.RecordEvent} e
*/
function pbcmsSanitizeEditorFields(e) {
	const { sanitizeHtml } = require(`${__hooks}/pbcms/html.cjs`)
	for (const field of e.record.collection().fields) {
		if (field.type() !== 'editor') continue
		const name = field.getName()
		const html = e.record.getString(name)
		if (html !== '') e.record.set(name, sanitizeHtml(html))
	}
	e.next()
}

onRecordCreate(pbcmsSanitizeEditorFields)
onRecordUpdate(pbcmsSanitizeEditorFields)
