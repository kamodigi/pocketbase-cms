package pbcms

import (
	"os"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

// maxMediaIDs is the most media ids looked up per record; images past it keep no src. Real content
// stays far below it.
const maxMediaIDs = 200

// enrichEditorFields cleans `editor` (rich text) fields in API responses (including realtime and
// expand) and points every <img data-media-id="…"> at the current file of that `media` record, so
// a replaced file or a new domain never leaves stale image URLs in rich text. The stored HTML is
// not changed.
//
// Sanitizing again here covers HTML that never went through sanitizeEditorFields: records saved
// before the package was registered, restored backups, raw SQL, or a hook that changed the value
// after the sanitizer ran.
//
// File URLs start with PBCMS_PUBLIC_URL if set (e.g. https://pb.example.com), else the Application
// URL in PocketBase's settings. An image whose media record is gone, or not viewable by the
// requester, loses its src. HTML longer than maxHTMLLength is returned empty.
//
// The JavaScript version is hooks/pb_hooks/pbcms_media_urls.pb.js.
func enrichEditorFields(e *core.RecordEnrichEvent) error {
	type editorValue struct{ name, html string }
	values := []editorValue{}
	ids := []string{}
	seen := map[string]bool{}
	for _, field := range e.Record.Collection().Fields {
		if field.Type() != core.FieldTypeEditor {
			continue
		}
		name := field.GetName()
		value := e.Record.GetString(name)
		if value == "" {
			continue
		}
		html := ""
		if jsLength(value) <= maxHTMLLength {
			html = sanitizeHTML(value)
		}
		values = append(values, editorValue{name, html})
		for _, id := range findMediaIDs(html) {
			if !seen[id] && len(ids) < maxMediaIDs {
				seen[id] = true
				ids = append(ids, id)
			}
		}
	}

	var media *core.Collection
	if len(ids) > 0 {
		media = findMediaCollection(e.App)
	}
	urls := map[string]string{}
	if media != nil {
		baseURL := publicBaseURL(os.Getenv("PBCMS_PUBLIC_URL"), e.App.Settings().Meta.AppURL)
		records, err := e.App.FindRecordsByIds(media, ids)
		if err != nil {
			return err
		}
		for _, record := range records {
			if e.RequestInfo == nil {
				continue
			}
			canView, err := e.App.CanAccessRecord(record, e.RequestInfo, media.ViewRule)
			if err != nil {
				return err
			}
			if !canView {
				continue
			}
			if filename := record.GetString("file"); filename != "" {
				urls[record.Id] = fileURL(baseURL, media.Id, record.Id, filename)
			}
		}
	}

	for _, value := range values {
		if media != nil {
			e.Record.Set(value.name, rewriteMediaSrc(value.html, urls))
		} else {
			e.Record.Set(value.name, value.html)
		}
	}
	return e.Next()
}

// findMediaCollection returns the `media` collection with a `file` field, or nil if the site has none.
func findMediaCollection(app core.App) *core.Collection {
	collection, err := app.FindCachedCollectionByNameOrId("media")
	if err != nil || collection.Fields.GetByName("file") == nil {
		return nil
	}
	return collection
}
