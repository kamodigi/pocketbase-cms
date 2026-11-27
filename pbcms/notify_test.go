package pbcms

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tests"
)

// The notifications themselves are tested against a real PocketBase in
// tests/integration/notify.test.ts, with the same cases as the JavaScript hook. This covers what only
// the Go package has: calling Register twice.
func TestRegisterTwiceNotifiesOnce(t *testing.T) {
	var mu sync.Mutex
	var bodies []string
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, string(body))
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer receiver.Close()

	configPath := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(configPath, []byte(`{"collections":{"notes":{}}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PBCMS_CONFIG_PATH", configPath)
	t.Setenv("PBCMS_NOTIFY_URL", receiver.URL)
	t.Setenv("PBCMS_NOTIFY_SECRET", "test-secret")

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection := core.NewBaseCollection("notes")
	collection.Fields.Add(&core.TextField{Name: "title"})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}

	Register(app)
	Register(app)

	record := core.NewRecord(collection)
	record.Set("title", "Hello")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(bodies) != 1 {
		t.Fatalf("got %d notifications, want 1: %v", len(bodies), bodies)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(bodies[0]), &body); err != nil {
		t.Fatal(err)
	}
	if body["action"] != "create" || body["collection"] != "notes" || body["old"] != nil {
		t.Errorf("unexpected body %s", bodies[0])
	}
	exported, _ := json.Marshal(record)
	if strings.Contains(string(exported), "pbcms") || strings.Contains(string(exported), "Pbcms") {
		t.Errorf("the queue leaks into the record's JSON: %s", exported)
	}
}
