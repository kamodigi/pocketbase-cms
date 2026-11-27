package pbcms

import (
	"os"
	"path/filepath"
	"slices"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

// Helpers shared by the CMS's routes: who counts as an editor, and which collections the CMS
// manages. The JavaScript version is hooks/pb_hooks/pbcms/cms.cjs.

// isEditor reports whether record is a signed-in editor: a `users` record with role = "editor".
func isEditor(record *core.Record) bool {
	return record != nil && record.Collection().Name == "users" && record.GetString("role") == "editor"
}

// managedCollectionNames returns the names of the collections the CMS manages (see
// configCollectionNames). The config is read on every call from PBCMS_CONFIG_PATH if set, else from
// pb_public/cms/config.json next to pb_data (PocketBase's default layout). It returns a 500 error,
// ready to return from a handler, if the config cannot be read.
func managedCollectionNames(e *core.RequestEvent) ([]string, error) {
	configPath := os.Getenv("PBCMS_CONFIG_PATH")
	if configPath == "" {
		configPath = filepath.Join(e.App.DataDir(), "..", "pb_public", "cms", "config.json")
	}
	data, err := os.ReadFile(configPath)
	var names []string
	if err == nil {
		names, err = configCollectionNames(data)
	}
	if err != nil {
		e.App.Logger().Error("pbcms: could not read the CMS config", "path", configPath, "error", err.Error())
		return nil, e.InternalServerError("The CMS config could not be read on the server.", nil)
	}
	return names, nil
}

// findManagedCollection returns the collection called name if names (from managedCollectionNames)
// has it, else nil. Only by name, never by id, and never a system collection such as _superusers.
func findManagedCollection(app core.App, names []string, name string) *core.Collection {
	if !slices.Contains(names, name) {
		return nil
	}
	collection, err := app.FindCachedCollectionByNameOrId(name)
	if err != nil || collection.Name != name || collection.System {
		return nil
	}
	return collection
}
