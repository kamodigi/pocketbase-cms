// A PocketBase built with Go and the pbcms package, for the integration and E2E tests (see
// tests/pocketbase.ts). It takes the same flags as the official binary that the tests use otherwise,
// so both run the same migrations, hooks and public files. A site's own main.go needs only
// pbcms.Register(app); the rest mirrors the official binary.
package main

import (
	"log"
	"net/http"
	"os"

	"ganigeorgiev.com/pocketbase/pocketbase"
	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/plugins/jsvm"
	"ganigeorgiev.com/pocketbase/pocketbase/plugins/migratecmd"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/hook"

	"github.com/kamodigi/pocketbase-cms/pbcms"
)

func main() {
	app := pocketbase.New()

	var hooksDir, migrationsDir, publicDir string
	var hooksWatch bool
	flags := app.RootCmd.PersistentFlags()
	flags.StringVar(&hooksDir, "hooksDir", "", "the directory with the JS app hooks")
	flags.BoolVar(&hooksWatch, "hooksWatch", true, "auto restart the app on pb_hooks file change")
	flags.StringVar(&migrationsDir, "migrationsDir", "", "the directory with the user defined migrations")
	flags.StringVar(&publicDir, "publicDir", "./pb_public", "the directory to serve static files")
	_ = app.RootCmd.ParseFlags(os.Args[1:])

	// The example presets and the dev seed are JavaScript migrations, and the hooks not yet ported to
	// Go are JavaScript too.
	jsvm.MustRegister(app, jsvm.Config{HooksDir: hooksDir, HooksWatch: hooksWatch, MigrationsDir: migrationsDir})
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Dir: migrationsDir, TemplateLang: migratecmd.TemplateLangJS})

	pbcms.Register(app)

	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			if !e.Router.HasRoute(http.MethodGet, "/{path...}") {
				e.Router.GET("/{path...}", apis.Static(os.DirFS(publicDir), true))
			}
			return e.Next()
		},
		Priority: 999,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
