package pbcms

import (
	"os"
	"strings"
	"sync"
	"testing"
	"unicode/utf8"

	"github.com/dop251/goja"
)

// The Go helpers are a port of hooks/pb_hooks/pbcms/html.cjs. These tests run the JavaScript in
// goja, the engine PocketBase runs hooks in, and check that both give the same output. The expected
// values themselves are tested in hooks/html.test.ts, and the hooks in tests/integration/.

type jsHTML struct {
	mu              sync.Mutex
	vm              *goja.Runtime
	sanitize        goja.Callable
	findMediaIDs    goja.Callable
	rewriteMediaSrc goja.Callable
	publicBaseURL   goja.Callable
	fileURL         goja.Callable
}

var loadJS = sync.OnceValues(func() (*jsHTML, error) {
	source, err := os.ReadFile("../hooks/pb_hooks/pbcms/html.cjs")
	if err != nil {
		return nil, err
	}
	vm := goja.New()
	wrapped := "(function (module, exports) {" + string(source) + "\n})"
	value, err := vm.RunScript("html.cjs", wrapped)
	if err != nil {
		return nil, err
	}
	wrapper, _ := goja.AssertFunction(value)
	module := vm.NewObject()
	exports := vm.NewObject()
	_ = module.Set("exports", exports)
	if _, err := wrapper(goja.Undefined(), module, exports); err != nil {
		return nil, err
	}
	api := module.Get("exports").ToObject(vm)
	fn := func(name string) goja.Callable {
		f, _ := goja.AssertFunction(api.Get(name))
		return f
	}
	return &jsHTML{
		vm:              vm,
		sanitize:        fn("sanitizeHtml"),
		findMediaIDs:    fn("findMediaIds"),
		rewriteMediaSrc: fn("rewriteMediaSrc"),
		publicBaseURL:   fn("publicBaseUrl"),
		fileURL:         fn("fileUrl"),
	}, nil
})

func js(t testing.TB) *jsHTML {
	t.Helper()
	h, err := loadJS()
	if err != nil {
		t.Fatalf("loading html.cjs: %v", err)
	}
	return h
}

func (h *jsHTML) call(t testing.TB, f goja.Callable, args ...any) goja.Value {
	t.Helper()
	h.mu.Lock()
	defer h.mu.Unlock()
	values := make([]goja.Value, len(args))
	for i, arg := range args {
		values[i] = h.vm.ToValue(arg)
	}
	result, err := f(goja.Undefined(), values...)
	if err != nil {
		t.Fatalf("html.cjs: %v", err)
	}
	return result
}

// Inputs from hooks/html.test.ts, plus some of the editor's output.
var sanitizeInputs = []string{
	"",
	"<h2>Title</h2><p><strong>bold</strong> and <em>italic</em>, <u>u</u> <s>s</s> <code>c</code> <mark>m</mark>" +
		" H<sub>2</sub>O x<sup>2</sup><br><a href=\"https://example.com/\" target=\"_blank\" rel=\"noopener noreferrer nofollow\">link</a></p>" +
		"<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol><blockquote><p>quote</p></blockquote><pre><code>x &lt; y</code></pre><hr>" +
		"<figure><img src=\"https://pb.example.com/api/files/c/r/a.webp\" alt=\"A cup\" width=\"1200\" height=\"800\" data-media-id=\"abc123\"><figcaption>Cap</figcaption></figure>" +
		"<table><tbody><tr><th colspan=\"2\" rowspan=\"1\" scope=\"col\">h</th></tr><tr><td style=\"min-width: 25px\">d</td></tr></tbody></table>" +
		"<p style=\"text-align: center\"><span style=\"color: #ff0000\">red</span> <span class=\"note\" id=\"intro\">x</span></p>",
	"<script>alert('xss')</script>",
	"<p>Hello <script>x</script>World</p>",
	"<p>a<SCRIPT type=\"text/javascript\">x</script >b</p>",
	"<p>a<script>never closed",
	"<style>body{display:none}</style><p>x</p>",
	"<iframe src=\"https://evil.example\"></iframe>",
	"<textarea><img src=x onerror=alert(1)></textarea>",
	"<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript>",
	"<plaintext><p>x</p>",
	"<p><font color=\"red\">red</font></p>",
	"<form action=\"/x\"><input name=\"a\">text</form>",
	"<svg><a href=\"javascript:alert(1)\">x</a></svg>",
	"<a onclick=\"evil()\" href=\"#\">x</a>",
	"<img src=\"x\" alt=\"img\" onerror=\"evil()\">",
	"<p data-x=\"1\" contenteditable>t</p>",
	"<img/src=\"x\"/onerror=alert(1)>",
	"<a href=\"javascript:alert(1)\">x</a>",
	"<a href=\" JaVaScRiPt:alert(1)\">x</a>",
	"<a href=\"java&#x09;script:alert(1)\">x</a>",
	"<a href=\"java&#9script&colon;alert(1)\">x</a>",
	"<a href=\"&#106;avascript:alert(1)\">x</a>",
	"<a href=\"&#X6A;avascript:alert(1)\">x</a><a href=\"&#0;&#99999999999;&#xD800;&#x;&#;\">y</a>",
	"<img src=\"data:image/svg+xml,<svg onload=alert(1)>\">",
	"<a href=\"vbscript:x\">x</a>",
	"<a href=\"mailto:a@example.com\">m</a><a href=\"tel:+81\">t</a>",
	"<a href=\"/news/1?a=1&amp;b=2#top\">x</a><img src=\"photo.jpg\">",
	"<a href=\"javascript&amp;colon;x\">x</a>",
	"<img alt=\"&AMP; &Amp &unknown; &lt;&gt;&quot;&apos;&nbsp;&tab;&newline;\">",
	"<p style=\"text-align: right; position: fixed; top: 0\">x</p>",
	"<span style=\"color: rgb( 1, 2 ,3 ); background-color: rgba(0 0  0 / 50%)\">x</span>",
	"<span style=\"color: hsl(120deg 50% 25%)\">x</span>",
	"<span style=\"COLOR: RGB(1,2,3); Text-Align: CENTER; width: 10PX; height: 2em\">x</span>",
	"<span style=\"background-color: url(https://evil.example/t.png)\">x</span>",
	"<span style=\"color: expression(alert(1))\">x</span>",
	"<td colspan=\"12345\" width=\"1234567\" style=\"min-width: 1234567px\">x</td>",
	"<p style=\"color: " + strings.Repeat("a", 31) + "\">x</p>",
	"<p style=\"text-align: center;" + strings.Repeat(" ", 1000) + "\">x</p>",
	"<img src=\"a.png\" width=\"100%\" height=\"auto\" data-media-id=\"a b\">",
	"<td colspan=\"2x\" scope=\"table\" class=\"a&quot;b\" id=\"1x\">x</td>",
	"<a href=\"/\" target=\"_blank\" rel=\"opener noopener NoFollow\">x</a>",
	"<a href=\"/\" rel=\"opener\">x</a>",
	"<a href=\"/\" target=\"preview\">x</a>",
	"<a rel=\"nofollow\" href=\"/\" target=\"_blank\">x</a>",
	"<a href=\"/\" target=\"x\" rel=\"nofollow ugc\">x</a>",
	strings.Repeat("<div>", 150) + "x" + strings.Repeat("</div>", 150),
	"<!DOCTYPE html><!-- c --><p>x<!-- <script>alert(1)</script> --></p><?xml x?>",
	"<p>x</p><!-- never closed <script>alert(1)</script>",
	"a < b > c & d &amp; &hellip; &#169; &#x1F600; &#X1f600; &#12x; &a1b;",
	"<p>1 <2</p>",
	"<img alt=\"a &quot;b&quot; <c>\">",
	"<p><strong>x",
	"<p><em>x</p>y</em>",
	"</div>x</p>",
	"<p>x</p><img src=\"a\" onerror=\"alert(1)",
	"<p>x</p><a href=\"x\"",
	"<img src=x onerror=alert(1)//>",
	"<svg><script>alert(1)</script></svg>",
	"<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
	"<a href=\"javas\x00cript:alert(1)\">x</a>",
	"<a href=\"\x01javascript:alert(1)\">x</a>",
	"<a href=\"\u0085javascript:alert(1)\">x</a>",
	"<p title=\"</p><script>alert(1)</script>\">x</p>",
	"<<script>script>alert(1)<</script>/script>",
	"<scr<script>ipt>alert(1)</script>",
	"<img \"\"\"><script>alert(1)</script>\">",
	"<a href=javascript&colon;alert(1)>x</a>",
	"<div style=\"background:url(javascript:alert(1))\">x</div>",
	"<object data=\"x.swf\"></object><embed src=\"x.swf\">",
	"<img src=\"x\" =onerror=alert(1)>",
	"<!--><img src=x onerror=alert(1)>-->",
	"<a href=\"https://example.com/\"x onmouseover=alert(1)>x</a>",
	"<script>x</script ><p>y</p></script>",
	"<p>a &amp; b <a href=\"/x?a=1&b=2\">l</a><img alt=\"q&quot;\" src=\"x.png\"> < > &</p>",
	"<p>日本語の<strong>本文</strong>と絵文字 😀</p><img alt=\"写真\" src=\"/写真.png\">",
	"</",
	"<",
	"<a",
	"<!",
}

func TestSanitizeHTMLMatchesJS(t *testing.T) {
	h := js(t)
	for _, input := range sanitizeInputs {
		want := h.call(t, h.sanitize, input).String()
		if got := sanitizeHTML(input); got != want {
			t.Errorf("sanitizeHTML(%q)\n got %q\nwant %q", input, got, want)
		}
		// Sanitizing is idempotent.
		if got := sanitizeHTML(sanitizeHTML(input)); got != sanitizeHTML(input) {
			t.Errorf("sanitizeHTML is not idempotent on %q: %q", input, got)
		}
	}
}

func TestSanitizeHTMLExamples(t *testing.T) {
	for input, want := range map[string]string{
		"<p onclick=\"steal()\">Hello<script>alert(1)</script> <a href=\"javascript:alert(1)\">link</a></p>": "<p>Hello <a>link</a></p>",
		"<a href=\"/\" target=\"preview\">x</a>": "<a href=\"/\" target=\"preview\" rel=\"noopener\">x</a>",
		"<p><em>x</p>y</em>":                     "<p><em>x</em></p>y",
	} {
		if got := sanitizeHTML(input); got != want {
			t.Errorf("sanitizeHTML(%q) = %q, want %q", input, got, want)
		}
	}
}

var mediaInputs = []string{
	"",
	"<img data-media-id=\"a1\" src=\"x\"><p>data-media-id=\"no\"</p><img src=\"y\"><img data-media-id=\"b2\"><img data-media-id=\"a1\">",
	"<span data-media-id=\"a1\"></span><img data-media-id=\"x y\">",
	"<p>x</p><img src=\"https://old.example/a.webp\" alt=\"A\" data-media-id=\"a1\" width=\"10\"><p>y</p>",
	"<img data-media-id=\"a1\">",
	"<img src='plain.png' alt=b><p data-media-id='a1'>t</p>",
	"<img src=\"old.png\" alt=\"A\" data-media-id=\"zz\">",
	"<img data-media-id=\"a1\" \"x=1 data-ok=\"y\">",
	"<img data-media-id=\"b2\" data-media-id=\"a1\" src=\"1\" src=\"2\">",
	"<script><img data-media-id=\"a1\"></script><img data-media-id=\"a1\"",
}

func TestMediaHelpersMatchJS(t *testing.T) {
	h := js(t)
	urls := map[string]string{
		"a1": "https://pb.example.com/api/files/col_media/a1/new.webp",
		"b2": "https://x.example/a\"b<c>.png?a=1&b=2",
	}
	for _, input := range mediaInputs {
		var want []string
		if err := h.vm.ExportTo(h.call(t, h.findMediaIDs, input), &want); err != nil {
			t.Fatal(err)
		}
		if got := findMediaIDs(input); strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("findMediaIDs(%q) = %q, want %q", input, got, want)
		}
		wantHTML := h.call(t, h.rewriteMediaSrc, input, urls).String()
		if got := rewriteMediaSrc(input, urls); got != wantHTML {
			t.Errorf("rewriteMediaSrc(%q)\n got %q\nwant %q", input, got, wantHTML)
		}
	}
}

func TestURLHelpersMatchJS(t *testing.T) {
	h := js(t)
	for _, pair := range [][2]string{
		{"https://pb.example.com/", "http://localhost:8090"},
		{"", "https://pb.example.com/"},
		{" ", "https://pb.example.com"},
		{"", ""},
		{" https://pb.example.com// ", ""},
	} {
		want := h.call(t, h.publicBaseURL, pair[0], pair[1]).String()
		if got := publicBaseURL(pair[0], pair[1]); got != want {
			t.Errorf("publicBaseURL(%q, %q) = %q, want %q", pair[0], pair[1], got, want)
		}
	}
	for _, filename := range []string{"photo a.webp", "a+b&c=d?e#f/g.png", "写真 (1)!~*'.png"} {
		want := h.call(t, h.fileURL, "https://pb.example.com", "col_media", "a1", filename).String()
		if got := fileURL("https://pb.example.com", "col_media", "a1", filename); got != want {
			t.Errorf("fileURL(%q) = %q, want %q", filename, got, want)
		}
	}
}

func TestSanitizeHTMLLinearTime(t *testing.T) {
	for _, input := range []string{
		strings.Repeat("<xmp></xmp>", 100_000),
		strings.Repeat("<div>", 100_000) + strings.Repeat("</span>", 100_000),
		"<p style=\"color: rgb(1" + strings.Repeat(" ", 1_000_000) + "x\">x</p>",
		"<p style=\"" + strings.Repeat("color: rgb(1;", 50_000) + "\">x</p>",
		"<p class=\"" + strings.Repeat("a", 1_000_000) + "!\" title=\"" + strings.Repeat("&a", 500_000) + "\">x</p>",
	} {
		sanitizeHTML(input)
	}
}

func TestJSLength(t *testing.T) {
	if got := jsLength("aé😀"); got != 4 {
		t.Errorf("jsLength = %d, want 4", got)
	}
}

// Characters that goja's toLowerCase or case-insensitive regular expressions map to ASCII letters
// (and U+0130, whose lowercase changes the string's length there, which shifts the end of a script
// element). The Go port follows browsers and folds ASCII only. Both give safe output; they only
// differ on markup that uses these characters.
const caseFoldedToASCII = "İıſK"

// FuzzSanitizeHTMLMatchesJS checks that the Go port gives the same output as html.cjs. Run it with
// go test ./pbcms -fuzz FuzzSanitizeHTMLMatchesJS.
func FuzzSanitizeHTMLMatchesJS(f *testing.F) {
	for _, input := range sanitizeInputs {
		f.Add(input)
	}
	for _, input := range mediaInputs {
		f.Add(input)
	}
	f.Fuzz(func(t *testing.T, input string) {
		if !utf8.ValidString(input) || strings.ContainsAny(input, caseFoldedToASCII) {
			t.Skip()
		}
		h := js(t)
		want := h.call(t, h.sanitize, input).String()
		got := sanitizeHTML(input)
		if got != want {
			t.Fatalf("sanitizeHTML(%q)\n got %q\nwant %q", input, got, want)
		}
		wantHTML := h.call(t, h.rewriteMediaSrc, got, map[string]string{"a1": "/x.png"}).String()
		if gotHTML := rewriteMediaSrc(got, map[string]string{"a1": "/x.png"}); gotHTML != wantHTML {
			t.Fatalf("rewriteMediaSrc(%q)\n got %q\nwant %q", got, gotHTML, wantHTML)
		}
	})
}
