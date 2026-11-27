package pbcms

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/hook"
)

// Notifications to the site: when a record of a collection the CMS manages (the same ones as GET
// /api/cms/schema) is created, updated or deleted, through the CMS, the API, the dashboard or
// app.Save(), the site is told, so it can rebuild its pages.
//
// Set both environment variables of PocketBase; without PBCMS_NOTIFY_URL nothing happens:
//
//	PBCMS_NOTIFY_URL     where to POST, e.g. https://www.example.com/api/revalidate
//	PBCMS_NOTIFY_SECRET  sent in the X-Pbcms-Secret header, for the site to check
//
// The JSON body is { "collection": "posts", "action": "create" | "update" | "delete", "old": record
// or null, "new": record or null }: the stored record before and after the change.
//
// The request is sent after the change is committed, and waits at most 10 seconds for the answer. A
// failure (no answer, a status other than 2xx, no secret, an unreadable CMS config) never fails the
// save; it is written to PocketBase's logs. There are no retries.
//
// A change is captured while it is written (the *Execute hooks), where the row before it is still in
// the database, and sent from the after-success hooks, which run once the transaction is committed.
// record.Original() cannot be used instead: PocketBase does not refresh it when a record instance is
// saved, so code that saves one twice would report the wrong previous values. In between, the change
// waits on the record instance as custom data under an "@pbInternal" key, which PocketBase never
// exports. It is a queue because a transaction may save one instance several times before the first
// after-success hook runs.
//
// The JavaScript version is hooks/pb_hooks/pbcms_notify.pb.js; both send the same.

const (
	notifyQueueKey = "@pbInternalPbcmsNotifyQueue"
	notifyTimeout  = 10 * time.Second
)

type notifyChange struct {
	Action     string          `json:"action"`
	Collection string          `json:"collection"`
	New        json.RawMessage `json:"new"`
	Old        json.RawMessage `json:"old"`
}

var notifyClient = &http.Client{Timeout: notifyTimeout}

func registerNotifyHooks(app core.App) {
	for action, hooks := range map[string]*hook.TaggedHook[*core.RecordEvent]{
		"create": app.OnRecordCreateExecute(),
		"update": app.OnRecordUpdateExecute(),
		"delete": app.OnRecordDeleteExecute(),
	} {
		hooks.Bind(&hook.Handler[*core.RecordEvent]{
			Id:   "pbcmsNotifyCapture",
			Func: func(e *core.RecordEvent) error { return captureChange(e, action) },
		})
	}

	for _, hooks := range []*hook.TaggedHook[*core.RecordEvent]{
		app.OnRecordAfterCreateSuccess(),
		app.OnRecordAfterUpdateSuccess(),
		app.OnRecordAfterDeleteSuccess(),
	} {
		hooks.Bind(&hook.Handler[*core.RecordEvent]{
			Id: "pbcmsNotifyDeliver",
			Func: func(e *core.RecordEvent) error {
				deliverChange(e)
				return e.Next()
			},
		})
	}

	for _, hooks := range []*hook.TaggedHook[*core.RecordErrorEvent]{
		app.OnRecordAfterCreateError(),
		app.OnRecordAfterUpdateError(),
		app.OnRecordAfterDeleteError(),
	} {
		hooks.Bind(&hook.Handler[*core.RecordErrorEvent]{
			Id: "pbcmsNotifyDiscard",
			Func: func(e *core.RecordErrorEvent) error {
				// Drops queued changes after a failed save or a rolled back transaction.
				e.Record.Set(notifyQueueKey, nil)
				return e.Next()
			},
		})
	}
}

// captureChange runs an *Execute hook: calls e.Next() and queues the change if it has to be
// notified. Only e.Next() may fail the save.
func captureChange(e *core.RecordEvent, action string) error {
	var change *notifyChange
	notified, err := isNotified(e.App, e.Record)
	if err == nil && notified {
		change = &notifyChange{Action: action, Collection: e.Record.Collection().Name, Old: json.RawMessage("null")}
		if action != "create" {
			change.Old, err = storedRecord(e.App, e.Record.Collection(), fmt.Sprint(e.Record.LastSavedPK()))
		}
	}
	if err != nil {
		change = nil
		logNotifyFailure(e, action, err)
	}

	if err := e.Next(); err != nil {
		return err
	}
	if change == nil {
		return nil
	}

	change.New = json.RawMessage("null")
	if action != "delete" {
		change.New, err = storedRecord(e.App, e.Record.Collection(), e.Record.Id)
		if err != nil {
			logNotifyFailure(e, action, err)
			return nil
		}
	}
	queue, _ := e.Record.Get(notifyQueueKey).([]*notifyChange)
	e.Record.Set(notifyQueueKey, append(slices.Clone(queue), change))
	return nil
}

// deliverChange sends the oldest queued change of the record. Failures are only logged: the change
// is already saved.
func deliverChange(e *core.RecordEvent) {
	queue, _ := e.Record.Get(notifyQueueKey).([]*notifyChange)
	if len(queue) == 0 {
		return
	}
	change := queue[0]
	e.Record.Set(notifyQueueKey, slices.Clone(queue[1:]))

	if err := sendChange(change); err != nil {
		logNotifyFailure(e, change.Action, err)
	}
}

func sendChange(change *notifyChange) error {
	body, err := json.Marshal(change)
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, os.Getenv("PBCMS_NOTIFY_URL"), bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Pbcms-Secret", os.Getenv("PBCMS_NOTIFY_SECRET"))

	response, err := notifyClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("the site answered %d", response.StatusCode)
	}
	return nil
}

// isNotified reports whether PBCMS_NOTIFY_URL is set and the CMS manages the record's collection.
// It fails if the config cannot be read, or if the URL is set without PBCMS_NOTIFY_SECRET: nothing
// is sent unauthenticated.
func isNotified(app core.App, record *core.Record) (bool, error) {
	if os.Getenv("PBCMS_NOTIFY_URL") == "" {
		return false, nil
	}
	collection := record.Collection()
	if collection.System {
		return false, nil
	}
	names, err := notifiedCollectionNames(app)
	if err != nil {
		return false, err
	}
	if !slices.Contains(names, collection.Name) {
		return false, nil
	}
	if os.Getenv("PBCMS_NOTIFY_SECRET") == "" {
		return false, errors.New("PBCMS_NOTIFY_SECRET is not set")
	}
	return true, nil
}

// notifiedCollectionNames returns the names of the collections the CMS manages, read from the
// config on every call, from the same place as GET /api/cms/schema reads it.
func notifiedCollectionNames(app core.App) ([]string, error) {
	configPath := os.Getenv("PBCMS_CONFIG_PATH")
	if configPath == "" {
		configPath = filepath.Join(app.DataDir(), "..", "pb_public", "cms", "config.json")
	}
	data, err := os.ReadFile(configPath)
	var names []string
	if err == nil {
		names, err = configCollectionNames(data)
	}
	if err != nil {
		app.Logger().Error("pbcms: could not read the CMS config", "path", configPath, "error", err.Error())
		return nil, errors.New("The CMS config could not be read on the server.")
	}
	return names, nil
}

func logNotifyFailure(e *core.RecordEvent, action string, err error) {
	e.App.Logger().Error(
		"pbcms: could not notify the site",
		"collection", e.Record.Collection().Name,
		"record", e.Record.Id,
		"action", action,
		"error", err.Error(),
	)
}

// storedRecord returns the record as it is in the database now, in the shape the API returns it:
// without hidden fields, and without the email of an auth record that does not show it.
func storedRecord(app core.App, collection *core.Collection, id string) (json.RawMessage, error) {
	record, err := app.FindRecordById(collection, id)
	if err != nil {
		return nil, err
	}
	return json.Marshal(record)
}
