package pbcms

import (
	"slices"
	"testing"
)

// The endpoint itself is tested against a real PocketBase in tests/integration/cms-schema.test.ts,
// with the same cases as the JavaScript hook. This covers the corners of reading the config.
func TestConfigCollectionNames(t *testing.T) {
	cases := []struct {
		name   string
		config string
		want   []string
	}{
		{"keys in written order, then media", `{"collections":{"posts":{},"about":{},"stores":{}},"media":{"collection":"media"}}`, []string{"posts", "about", "stores", "media"}},
		{"media already named", `{"collections":{"media":{},"posts":{}},"media":{"collection":"media"}}`, []string{"media", "posts"}},
		{"nested values are skipped", `{"collections":{"a":{"fields":{"x":{"y":[1,{"z":2}]}}},"b":[]}}`, []string{"a", "b"}},
		{"no collections", `{"media":{"collection":"media"}}`, []string{"media"}},
		{"media collection not a string", `{"collections":{"posts":{}},"media":{"collection":3}}`, []string{"posts"}},
		{"media null", `{"collections":{"posts":{}},"media":null}`, []string{"posts"}},
		{"collections not an object", `{"collections":"posts"}`, []string{}},
		{"keys are case-sensitive", `{"Collections":{"posts":{}},"Media":{"collection":"media"}}`, []string{}},
		{"config not an object", `[1,2]`, []string{}},
		{"config null", `null`, []string{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := configCollectionNames([]byte(c.config))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !slices.Equal(got, c.want) {
				t.Errorf("got %q, want %q", got, c.want)
			}
		})
	}
}

func TestConfigCollectionNamesInvalidJSON(t *testing.T) {
	for _, config := range []string{``, `{`, `{"collections":{"posts":}}`} {
		if _, err := configCollectionNames([]byte(config)); err == nil {
			t.Errorf("%q: expected an error", config)
		}
	}
}
