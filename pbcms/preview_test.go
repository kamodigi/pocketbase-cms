package pbcms

import "testing"

// The routes are tested against a real PocketBase in tests/integration/cms-preview.test.ts, with the
// same cases as the JavaScript hook. This covers reading PBCMS_PREVIEW_TOKEN_DURATION.
func TestPreviewTokenDuration(t *testing.T) {
	cases := map[string]int{
		"":                     600,
		"2":                    2,
		"3600":                 3600,
		"0":                    600,
		"-5":                   600,
		"1.5":                  600,
		" 60":                  600,
		"60s":                  600,
		"010":                  600,
		"99999999999999999999": 600,
	}
	for value, want := range cases {
		if got := previewTokenDuration(value); got != want {
			t.Errorf("%q: got %d, want %d", value, got, want)
		}
	}
}
