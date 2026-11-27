package pbcms

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

// GET /api/cms/schema returns, to a signed-in editor (a `users` record with role = "editor"), the
// definitions of the collections the CMS manages. PocketBase's own /api/collections is for
// superusers only. No token: 401. Any other account: 403.
//
// The collections the CMS manages are the ones the site's config names: the keys of `collections`
// and `media.collection`. The config is read on every request from PBCMS_CONFIG_PATH if set, else
// from pb_public/cms/config.json next to pb_data (PocketBase's default layout). Names the schema
// lacks are skipped, and the CMS warns about them. System collections such as _superusers are never
// returned.
//
// Each collection comes as { id, name, type, fields }; fields are PocketBase's own definitions,
// minus hidden ones (an auth collection's password and tokenKey), which the API never returns
// anyway. Rules, indexes and auth settings are left out.
//
// The JavaScript version is hooks/pb_hooks/pbcms_schema.pb.js; both answer the same.

type schemaCollection struct {
	ID     string          `json:"id"`
	Name   string          `json:"name"`
	Type   string          `json:"type"`
	Fields core.FieldsList `json:"fields"`
}

func schemaHandler(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Sign in as an editor.", nil)
	}
	if e.Auth.Collection().Name != "users" || e.Auth.GetString("role") != "editor" {
		return e.ForbiddenError("Only editors can read the CMS schema.", nil)
	}

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
		return e.InternalServerError("The CMS config could not be read on the server.", nil)
	}

	collections := []schemaCollection{}
	for _, name := range names {
		collection, err := e.App.FindCachedCollectionByNameOrId(name)
		// Only by name: an id in the config is not a name the CMS can match.
		if err != nil || collection.Name != name || collection.System {
			continue
		}
		fields := core.FieldsList{}
		for _, field := range collection.Fields {
			if !field.GetHidden() {
				fields = append(fields, field)
			}
		}
		collections = append(collections, schemaCollection{
			ID:     collection.Id,
			Name:   collection.Name,
			Type:   collection.Type,
			Fields: fields,
		})
	}
	return e.JSON(http.StatusOK, map[string]any{"collections": collections})
}

// configCollectionNames returns the collection names a cms.config.json names: the keys of
// `collections` in the order they are written, then `media.collection`, without repeats. It fails
// only on JSON that does not parse; a config of another shape names no collections.
func configCollectionNames(data []byte) ([]string, error) {
	if !json.Valid(data) {
		return nil, errors.New("the config is not valid JSON")
	}

	var config map[string]json.RawMessage
	if json.Unmarshal(data, &config) != nil {
		return []string{}, nil
	}

	names := []string{}
	seen := map[string]bool{}
	add := func(name string) {
		if !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}

	// A map loses the order of the keys, and the CMS shows the collections in the config's order.
	keys, err := objectKeys(config["collections"])
	if err != nil {
		return nil, err
	}
	for _, key := range keys {
		add(key)
	}

	var media map[string]json.RawMessage
	if json.Unmarshal(config["media"], &media) == nil {
		var collection any
		if json.Unmarshal(media["collection"], &collection) == nil {
			if name, ok := collection.(string); ok {
				add(name)
			}
		}
	}

	return names, nil
}

// objectKeys returns the keys of a JSON object in the order they are written, or none if raw is not
// an object.
func objectKeys(raw json.RawMessage) ([]string, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return nil, nil
	}

	var keys []string
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		key, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("unexpected token %v", token)
		}
		keys = append(keys, key)
		// Skip the value.
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
	}
	return keys, nil
}
