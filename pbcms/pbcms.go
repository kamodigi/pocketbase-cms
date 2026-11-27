// Package pbcms adds pocketbase-cms's server side to a PocketBase built with Go. It does the same as
// the JavaScript hooks in hooks/pb_hooks/; use one or the other, not both.
//
//	app := pocketbase.New()
//	pbcms.Register(app)
package pbcms

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/hook"
)

// Register adds the CMS's endpoint and hooks to app: GET /api/cms/schema, sanitizing `editor` fields
// on save, and sanitizing them again in responses with image URLs looked up afresh. Calling it again
// replaces them instead of adding them twice.
func Register(app core.App) {
	app.OnRecordCreate().Bind(&hook.Handler[*core.RecordEvent]{
		Id:   "pbcmsSanitizeOnCreate",
		Func: sanitizeEditorFields,
	})
	app.OnRecordUpdate().Bind(&hook.Handler[*core.RecordEvent]{
		Id:   "pbcmsSanitizeOnUpdate",
		Func: sanitizeEditorFields,
	})
	app.OnRecordEnrich().Bind(&hook.Handler[*core.RecordEnrichEvent]{
		Id:   "pbcmsEditorFields",
		Func: enrichEditorFields,
	})
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Id: "pbcmsRoutes",
		Func: func(e *core.ServeEvent) error {
			e.Router.GET("/api/cms/schema", schemaHandler)
			return e.Next()
		},
	})
}
