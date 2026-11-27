package pbcms

import (
	"fmt"

	"ganigeorgiev.com/pocketbase/ozzo-validation/v4"
	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

// sanitizeEditorFields cleans every `editor` (rich text) field before a record is saved through
// PocketBase (the API, the dashboard, or app.Save() in hooks and migrations). It does not see
// records saved before it was registered, restored backups, raw SQL, or changes that a hook running
// after this one makes before it calls e.Next(); enrichEditorFields sanitizes responses again for
// those.
//
// The JavaScript version is hooks/pb_hooks/pbcms_sanitize.pb.js.
func sanitizeEditorFields(e *core.RecordEvent) error {
	for _, field := range e.Record.Collection().Fields {
		if field.Type() != core.FieldTypeEditor {
			continue
		}
		name := field.GetName()
		html := e.Record.GetString(name)
		if jsLength(html) > maxHTMLLength {
			return apis.NewBadRequestError("The rich text is too long.", validation.Errors{
				name: validation.NewError("pbcms_html_too_long", fmt.Sprintf("Must be at most %d characters.", maxHTMLLength)),
			})
		}
		if html != "" {
			e.Record.Set(name, sanitizeHTML(html))
		}
	}
	return e.Next()
}
