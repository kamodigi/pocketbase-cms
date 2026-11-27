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

// Register adds the CMS's endpoints to app. Calling it again replaces them instead of adding them twice.
func Register(app core.App) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Id: "pbcmsRoutes",
		Func: func(e *core.ServeEvent) error {
			e.Router.GET("/api/cms/schema", schemaHandler)
			registerPreviewRoutes(e)
			return e.Next()
		},
	})
}
