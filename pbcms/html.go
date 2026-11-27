package pbcms

// HTML helpers for sanitizing `editor` fields on save and pointing <img data-media-id> at the media
// file's current URL on read. This is a port of hooks/pb_hooks/pbcms/html.cjs, with the same
// allowlist and the same output; html_test.go runs both on the same inputs and compares them.
// Change the two together.
//
// The sanitizer never passes input through: it re-serializes the tokens it keeps, escaping every
// text run and attribute value, and closes every tag it opens. Positions are byte offsets; the
// tokenizer only looks for ASCII characters, which never occur inside a multi-byte UTF-8 sequence.

import (
	"regexp"
	"slices"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// maxHTMLLength is the longest rich text accepted on save and served in responses, in UTF-16 code
// units like the JavaScript version's string length. Real rich text stays far below it; images are
// only references.
const maxHTMLLength = 200_000

// Based on the allowlist of the rich text editor this CMS grew out of, plus data-media-id.
var allowedTags = setOf(
	"a", "blockquote", "br", "code", "div", "em", "figcaption", "figure", "h1", "h2", "h3", "h4",
	"h5", "h6", "hr", "img", "li", "mark", "ol", "p", "pre", "s", "span", "strong", "sub", "sup",
	"table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
)

var voidTags = setOf("br", "hr", "img")

// Elements whose content is not HTML (or must never be shown); they are dropped with their content.
var rawTextTags = setOf(
	"iframe", "noembed", "noframes", "noscript", "plaintext", "script", "style", "textarea", "title", "xmp",
)

// Digit counts are capped: no real table or image needs more.
var (
	integerPattern = regexp.MustCompile(`^\d{1,4}$`)
	sizePattern    = regexp.MustCompile(`^\d{1,6}(?:\.\d{1,4})?%?$`)
	classPattern   = regexp.MustCompile(`^[\w\- ]+$`)
	idPattern      = regexp.MustCompile(`^[A-Za-z][\w-]*$`)
	scopePattern   = regexp.MustCompile(`^(?:col|colgroup|row|rowgroup)$`)
	targetPattern  = regexp.MustCompile(`^_?[\w-]+$`)
	mediaIDPattern = regexp.MustCompile(`^[\w-]{1,100}$`)
	schemePattern  = regexp.MustCompile(`^([A-Za-z][\d+.A-Za-z-]*):`)
	attrNameOK     = regexp.MustCompile(`^[a-z][\w-]*$`)
)

func matching(pattern *regexp.Regexp) func(string) (string, bool) {
	return func(value string) (string, bool) { return value, pattern.MatchString(value) }
}

// Attribute name -> check. A check returns the value to keep, or false to drop the attribute.
var allowedAttrs = map[string]func(string) (string, bool){
	"alt":           func(value string) (string, bool) { return value, true },
	"class":         matching(classPattern),
	"colspan":       matching(integerPattern),
	"data-media-id": matching(mediaIDPattern),
	"height":        matching(sizePattern),
	"href":          safeURL,
	"id":            matching(idPattern),
	"rel":           safeRel,
	"rowspan":       matching(integerPattern),
	"scope":         matching(scopePattern),
	"src":           safeURL,
	"style":         safeStyle,
	"target":        matching(targetPattern),
	"width":         matching(sizePattern),
}

// rel values that never give the linked page a handle on this one.
var relTokens = setOf("external", "nofollow", "noopener", "noreferrer", "sponsored", "ugc")

// Deeper nesting is flattened, so closing tags never costs more than this per tag.
const maxDepth = 100

var allowedSchemes = setOf("http", "https", "mailto", "tel")

// Matched against values normalized by normalizeStyleValue. The JavaScript patterns that ignore
// case are matched here against the ASCII-lowercased value, since Go's (?i) would also fold
// characters such as U+017F (ſ) to ASCII letters, which JavaScript does not.
const styleNumber = `[\d.]{1,10}(?:%|deg)?`

var (
	colorPattern     = regexp.MustCompile(`^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\(` + styleNumber + `(?:[ ,/]` + styleNumber + `){2,3}\)|[a-z]{1,30})$`)
	lengthPattern    = regexp.MustCompile(`^\d{1,6}(?:\.\d{1,4})?(?:px|%|em|rem)$`)
	textAlignPattern = regexp.MustCompile(`^(?:left|right|center|justify|start|end)$`)
)

// Longer style attributes and declaration values are dropped without being looked at.
const (
	maxStyleLength      = 1000
	maxStyleValueLength = 100
)

func ignoringCase(pattern *regexp.Regexp) func(string) bool {
	return func(value string) bool { return pattern.MatchString(asciiLower(value)) }
}

// CSS property -> allowed value. Only what the editor writes: alignment, colors and table widths.
var allowedStyles = map[string]func(string) bool{
	"background-color": ignoringCase(colorPattern),
	"color":            ignoringCase(colorPattern),
	"height":           lengthPattern.MatchString,
	"min-width":        lengthPattern.MatchString,
	"text-align":       ignoringCase(textAlignPattern),
	"width":            lengthPattern.MatchString,
}

var namedEntities = map[string]string{
	"amp":     "&",
	"apos":    "'",
	"colon":   ":",
	"gt":      ">",
	"lt":      "<",
	"nbsp":    " ",
	"newline": "\n",
	"quot":    `"`,
	"tab":     "\t",
}

type htmlAttr struct {
	name  string
	value string
}

type tokenType int

const (
	tokenText tokenType = iota
	tokenStart
	tokenEnd
	// Comments, doctypes and the content of raw text elements.
	tokenSkip
)

type htmlToken struct {
	typ      tokenType
	from, to int
	name     string
	attrs    []htmlAttr
}

func setOf(values ...string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		set[value] = true
	}
	return set
}

// asciiLower lowercases A-Z only, so byte offsets stay the same.
func asciiLower(s string) string {
	for i := 0; i < len(s); i++ {
		if c := s[i]; c >= 'A' && c <= 'Z' {
			b := []byte(s)
			for j := i; j < len(b); j++ {
				if b[j] >= 'A' && b[j] <= 'Z' {
					b[j] += 'a' - 'A'
				}
			}
			return string(b)
		}
	}
	return s
}

func isASCIILetter(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func isASCIIDigit(c byte) bool {
	return c >= '0' && c <= '9'
}

func isHexDigit(c byte) bool {
	return isASCIIDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// isJSSpace is JavaScript's \s and String.prototype.trim: WhiteSpace and LineTerminator.
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

// jsLength is the length of s in UTF-16 code units, as JavaScript counts it.
func jsLength(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}

// isHTMLSpace is HTML whitespace: tab, line feed, form feed, carriage return and space.
func isHTMLSpace(c byte) bool {
	return c == '\t' || c == '\n' || c == '\f' || c == '\r' || c == ' '
}

func isTagNameEnd(c byte) bool {
	return c == '>' || c == '/' || isHTMLSpace(c)
}

func isAttributeNameEnd(c byte) bool {
	return c == '=' || isTagNameEnd(c)
}

func isUnquotedValueEnd(c byte) bool {
	return c == '>' || isHTMLSpace(c)
}

func isControlOrSpace(r rune) bool {
	return r <= 0x20 || (r >= 0x7f && r <= 0x9f)
}

// closeUpTo pops and closes the open tags down to and including name, so the output stays well-formed.
func closeUpTo(open *[]string, name string, out *strings.Builder) {
	for {
		last := len(*open) - 1
		closed := (*open)[last]
		*open = (*open)[:last]
		out.WriteString("</" + closed + ">")
		if closed == name {
			return
		}
	}
}

// decodeEntities decodes character references in an attribute value. Unknown named references stay
// as they are; they are escaped on output, so a browser never decodes them either.
func decodeEntities(value string) string {
	if !strings.Contains(value, "&") {
		return value
	}
	var out strings.Builder
	pos := 0
	for {
		amp := strings.IndexByte(value[pos:], '&')
		if amp == -1 {
			out.WriteString(value[pos:])
			return out.String()
		}
		amp += pos
		out.WriteString(value[pos:amp])
		decoded, end := decodeReference(value, amp+1)
		if end == -1 {
			out.WriteByte('&')
			pos = amp + 1
			continue
		}
		out.WriteString(decoded)
		pos = end
	}
}

// decodeReference reads a character reference after the "&" at from-1. It returns the text to put
// in its place and where it ends, or -1 if there is none.
func decodeReference(value string, from int) (string, int) {
	length := len(value)
	if from < length && value[from] == '#' {
		start, base := from+1, 10
		if start < length && !isASCIIDigit(value[start]) && (value[start] == 'x' || value[start] == 'X') {
			start, base = start+1, 16
		}
		end := start
		code := 0
		for end < length && ((base == 10 && isASCIIDigit(value[end])) || (base == 16 && isHexDigit(value[end]))) {
			if code <= 0x10ffff {
				code = code*base + hexValue(value[end])
			}
			end++
		}
		if end == start {
			return "", -1
		}
		if end < length && value[end] == ';' {
			end++
		}
		if code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) {
			return string(rune(code)), end
		}
		return "�", end
	}
	end := from
	for end < length && isASCIILetter(value[end]) {
		end++
	}
	if end == from {
		return "", -1
	}
	name := value[from:end]
	if end < length && value[end] == ';' {
		if decoded, ok := namedEntities[asciiLower(name)]; ok {
			return decoded, end + 1
		}
		end++
	}
	return "&" + value[from:end], end
}

func hexValue(c byte) int {
	switch {
	case isASCIIDigit(c):
		return int(c - '0')
	case c >= 'a':
		return int(c-'a') + 10
	default:
		return int(c-'A') + 10
	}
}

var attributeEscaper = strings.NewReplacer("&", "&amp;", `"`, "&quot;", "<", "&lt;", ">", "&gt;")

func escapeAttribute(value string) string {
	return attributeEscaper.Replace(value)
}

// escapeText keeps character references the input already has, but escapes a bare "&".
func escapeText(text string) string {
	if !strings.ContainsAny(text, "&<>") {
		return text
	}
	var out strings.Builder
	for i := 0; i < len(text); i++ {
		switch c := text[i]; c {
		case '<':
			out.WriteString("&lt;")
		case '>':
			out.WriteString("&gt;")
		case '&':
			if isReference(text, i+1) {
				out.WriteByte('&')
			} else {
				out.WriteString("&amp;")
			}
		default:
			out.WriteByte(c)
		}
	}
	return out.String()
}

// isReference reports whether a named, decimal or hexadecimal reference ending in ";" starts at from.
func isReference(text string, from int) bool {
	length := len(text)
	if from >= length {
		return false
	}
	end := from
	switch {
	case isASCIILetter(text[from]):
		end++
		for end < length && (isASCIILetter(text[end]) || isASCIIDigit(text[end])) {
			end++
		}
		return end < length && text[end] == ';'
	case text[from] != '#':
		return false
	}
	end++
	digits := end
	for end < length && isASCIIDigit(text[end]) {
		end++
	}
	if end > digits {
		return end < length && text[end] == ';'
	}
	if end >= length || (text[end] != 'x' && text[end] != 'X') {
		return false
	}
	end++
	digits = end
	for end < length && isHexDigit(text[end]) {
		end++
	}
	return end > digits && end < length && text[end] == ';'
}

// fileURL is the URL PocketBase serves a record's file at.
func fileURL(baseURL, collectionID, recordID, filename string) string {
	return baseURL + "/api/files/" + encodeURIComponent(collectionID) + "/" + encodeURIComponent(recordID) + "/" + encodeURIComponent(filename)
}

// encodeURIComponent escapes s as JavaScript's encodeURIComponent does.
func encodeURIComponent(s string) string {
	const hex = "0123456789ABCDEF"
	var out strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if isASCIILetter(c) || isASCIIDigit(c) || strings.IndexByte("-_.!~*'()", c) >= 0 {
			out.WriteByte(c)
		} else {
			out.WriteByte('%')
			out.WriteByte(hex[c>>4])
			out.WriteByte(hex[c&15])
		}
	}
	return out.String()
}

// findMediaIDs returns the distinct data-media-id values of the <img> tags in html.
func findMediaIDs(html string) []string {
	ids := []string{}
	if !strings.Contains(html, "data-media-id") {
		return ids
	}
	for _, token := range tokenize(html) {
		if token.typ != tokenStart || token.name != "img" {
			continue
		}
		if id, ok := mediaIDOf(token); ok && !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	return ids
}

// findRawTextEnd finds "</name" followed by whitespace, "/" or ">" at or after from in the
// lowercased HTML.
func findRawTextEnd(lower, name string, from int) int {
	pos := from
	for {
		found := strings.Index(lower[pos:], "</"+name)
		if found == -1 {
			return -1
		}
		found += pos
		after := found + len(name) + 2
		if after >= len(lower) {
			return found
		}
		if r, _ := utf8.DecodeRuneInString(lower[after:]); r == '/' || r == '>' || isJSSpace(r) {
			return found
		}
		pos = found + 1
	}
}

func isMediaID(value string) bool {
	return mediaIDPattern.MatchString(value)
}

func mediaIDOf(token htmlToken) (string, bool) {
	for _, attr := range token.attrs {
		if attr.name == "data-media-id" {
			return attr.value, isMediaID(attr.value)
		}
	}
	return "", false
}

// normalizeStyleValue collapses whitespace to single spaces, then removes the spaces around "(",
// ")", "," and "/".
func normalizeStyleValue(value string) string {
	collapsed := strings.Join(strings.FieldsFunc(value, isJSSpace), " ")
	var out strings.Builder
	for i := 0; i < len(collapsed); i++ {
		c := collapsed[i]
		if c == ' ' && ((i > 0 && isStyleSeparator(collapsed[i-1])) || (i+1 < len(collapsed) && isStyleSeparator(collapsed[i+1]))) {
			continue
		}
		out.WriteByte(c)
	}
	return out.String()
}

func isStyleSeparator(c byte) bool {
	return c == '(' || c == ')' || c == ',' || c == '/'
}

// publicBaseURL is the origin that file URLs start with: PBCMS_PUBLIC_URL if set, else
// PocketBase's Application URL setting. It returns "" if neither is set, which gives root-relative
// URLs. Request headers such as X-Forwarded-Host are not used, since a client can set them when
// PocketBase is not behind a proxy.
func publicBaseURL(envURL, appURL string) string {
	if url := trimTrailingSlash(envURL); url != "" {
		return url
	}
	return trimTrailingSlash(appURL)
}

func trimTrailingSlash(url string) string {
	return strings.TrimRight(strings.TrimFunc(url, isJSSpace), "/")
}

// readTag reads a tag name and attributes from from up to and including ">". ok is false when the
// input ends first.
func readTag(html string, from int) (name string, attrs []htmlAttr, to int, ok bool) {
	length := len(html)
	pos := from
	for pos < length && !isTagNameEnd(html[pos]) {
		pos++
	}
	name = asciiLower(html[from:pos])

	for pos < length {
		c := html[pos]
		if c == '>' {
			return name, attrs, pos + 1, true
		}
		if c == '/' || isHTMLSpace(c) {
			pos++
			continue
		}
		attrStart := pos
		pos++ // The first character may be "=", which then belongs to the name.
		for pos < length && !isAttributeNameEnd(html[pos]) {
			pos++
		}
		attrName := asciiLower(html[attrStart:pos])
		nameEnd := pos
		value := ""
		for pos < length && isHTMLSpace(html[pos]) {
			pos++
		}
		if pos < length && html[pos] == '=' {
			pos++
			for pos < length && isHTMLSpace(html[pos]) {
				pos++
			}
			if pos < length && (html[pos] == '"' || html[pos] == '\'') {
				closing := strings.IndexByte(html[pos+1:], html[pos])
				if closing == -1 {
					return "", nil, 0, false
				}
				value = html[pos+1 : pos+1+closing]
				pos += closing + 2
			} else {
				valueStart := pos
				for pos < length && !isUnquotedValueEnd(html[pos]) {
					pos++
				}
				value = html[valueStart:pos]
			}
		} else {
			// No value: whatever follows the spaces starts the next attribute.
			pos = nameEnd
		}
		attrs = append(attrs, htmlAttr{name: attrName, value: decodeEntities(value)})
	}
	return "", nil, 0, false
}

// requireNoopener adds noopener to rel when there is a target. Browsers imply it for _blank only,
// not for named targets.
func requireNoopener(attrs []htmlAttr) []htmlAttr {
	if !slices.ContainsFunc(attrs, func(attr htmlAttr) bool { return attr.name == "target" }) {
		return attrs
	}
	rel := slices.IndexFunc(attrs, func(attr htmlAttr) bool { return attr.name == "rel" })
	if rel == -1 {
		return append(attrs, htmlAttr{name: "rel", value: "noopener"})
	}
	if !slices.Contains(strings.Split(attrs[rel].value, " "), "noopener") {
		attrs[rel].value += " noopener"
	}
	return attrs
}

// rewriteMediaSrc sets the src of every <img data-media-id> to urls[id], or removes it when the id
// is not in urls (a deleted media record, or one the requester may not view). Images without the
// attribute are left alone, as is everything else in html.
func rewriteMediaSrc(html string, urls map[string]string) string {
	if !strings.Contains(html, "data-media-id") {
		return html
	}
	var out strings.Builder
	copied := 0
	for _, token := range tokenize(html) {
		if token.typ != tokenStart || token.name != "img" {
			continue
		}
		id, ok := mediaIDOf(token)
		if !ok {
			continue
		}
		// The input is sanitized already; checking names again keeps the output well-formed anyway.
		attrs := []htmlAttr{}
		if url, ok := urls[id]; ok {
			attrs = append(attrs, htmlAttr{name: "src", value: url})
		}
		for _, attr := range token.attrs {
			if attr.name != "src" && attrNameOK.MatchString(attr.name) {
				attrs = append(attrs, attr)
			}
		}
		out.WriteString(html[copied:token.from])
		out.WriteString(serializeStartTag("img", attrs))
		copied = token.to
	}
	if copied == 0 {
		return html
	}
	out.WriteString(html[copied:])
	return out.String()
}

// safeRel keeps the rel tokens in relTokens.
func safeRel(value string) (string, bool) {
	kept := []string{}
	for _, token := range strings.FieldsFunc(strings.ToLower(value), isJSSpace) {
		if relTokens[token] {
			kept = append(kept, token)
		}
	}
	return strings.Join(kept, " "), len(kept) > 0
}

// safeStyle keeps the declarations in allowedStyles whose values match and drops the rest.
func safeStyle(value string) (string, bool) {
	if jsLength(value) > maxStyleLength {
		return "", false
	}
	kept := []string{}
	for _, declaration := range strings.Split(value, ";") {
		colon := strings.IndexByte(declaration, ':')
		if colon == -1 {
			continue
		}
		property := strings.ToLower(strings.TrimFunc(declaration[:colon], isJSSpace))
		propertyValue := normalizeStyleValue(declaration[colon+1:])
		if jsLength(propertyValue) > maxStyleValueLength {
			continue
		}
		if check, ok := allowedStyles[property]; ok && check(propertyValue) {
			kept = append(kept, property+": "+propertyValue)
		}
	}
	return strings.Join(kept, "; "), len(kept) > 0
}

// safeURL keeps relative URLs and http, https, mailto and tel URLs.
func safeURL(value string) (string, bool) {
	// Browsers strip leading and trailing spaces and control characters from URLs.
	trimmed := strings.TrimFunc(value, func(r rune) bool { return r <= 0x20 })
	// They also ignore tabs and newlines inside, so "java\tscript:" is still a scheme. Drop every
	// control character to be safe.
	compact := strings.Map(func(r rune) rune {
		if isControlOrSpace(r) {
			return -1
		}
		return r
	}, trimmed)
	scheme := schemePattern.FindStringSubmatch(compact)
	if scheme != nil && !allowedSchemes[asciiLower(scheme[1])] {
		return "", false
	}
	return trimmed, true
}

// sanitizeHTML returns html with only the allowed tags, attributes, URL schemes and styles. Script,
// style and similar elements are removed with their content; other disallowed tags are removed but
// their text is kept.
func sanitizeHTML(html string) string {
	if html == "" {
		return ""
	}
	var out strings.Builder
	open := []string{}

	for _, token := range tokenize(html) {
		switch {
		case token.typ == tokenText:
			out.WriteString(escapeText(html[token.from:token.to]))
		case token.typ == tokenStart && allowedTags[token.name]:
			attrs := []htmlAttr{}
			seen := map[string]bool{}
			for _, attr := range token.attrs {
				// Browsers keep the first of duplicate attributes.
				if seen[attr.name] {
					continue
				}
				seen[attr.name] = true
				if check, ok := allowedAttrs[attr.name]; ok {
					if value, ok := check(attr.value); ok {
						attrs = append(attrs, htmlAttr{name: attr.name, value: value})
					}
				}
			}
			attrs = requireNoopener(attrs)
			if voidTags[token.name] {
				out.WriteString(serializeStartTag(token.name, attrs))
			} else if len(open) < maxDepth {
				out.WriteString(serializeStartTag(token.name, attrs))
				open = append(open, token.name)
			}
		case token.typ == tokenEnd && slices.Contains(open, token.name):
			closeUpTo(&open, token.name, &out)
		}
	}
	for len(open) > 0 {
		last := len(open) - 1
		out.WriteString("</" + open[last] + ">")
		open = open[:last]
	}
	return out.String()
}

func serializeStartTag(name string, attrs []htmlAttr) string {
	var out strings.Builder
	out.WriteString("<" + name)
	for _, attr := range attrs {
		out.WriteString(" " + attr.name + `="` + escapeAttribute(attr.value) + `"`)
	}
	out.WriteByte('>')
	return out.String()
}

// tokenize splits HTML into tokens, following the HTML tokenizer closely enough that a browser
// sees the same tags. Input that ends inside a tag or comment yields a final skip token.
func tokenize(html string) []htmlToken {
	tokens := []htmlToken{}
	pos := 0
	length := len(html)
	// Lowercased once: doing it per raw text element would make hostile input quadratic.
	lower := asciiLower(html)

	for pos < length {
		lt := strings.IndexByte(html[pos:], '<')
		if lt == -1 {
			tokens = append(tokens, htmlToken{typ: tokenText, from: pos, to: length})
			break
		}
		lt += pos
		if lt > pos {
			tokens = append(tokens, htmlToken{typ: tokenText, from: pos, to: lt})
		}

		if strings.HasPrefix(html[lt:], "<!--") {
			closing := strings.Index(html[lt+4:], "-->")
			if closing == -1 {
				return append(tokens, htmlToken{typ: tokenSkip, from: lt, to: length})
			}
			pos = lt + 4 + closing + 3
			tokens = append(tokens, htmlToken{typ: tokenSkip, from: lt, to: pos})
			continue
		}

		next := byteAt(html, lt+1)
		if next == '!' || next == '?' || (next == '/' && !isASCIILetter(byteAt(html, lt+2))) {
			// Doctype, processing instruction or a malformed end tag: a bogus comment up to ">".
			closing := strings.IndexByte(html[lt+1:], '>')
			if closing == -1 {
				return append(tokens, htmlToken{typ: tokenSkip, from: lt, to: length})
			}
			pos = lt + 1 + closing + 1
			tokens = append(tokens, htmlToken{typ: tokenSkip, from: lt, to: pos})
			continue
		}

		isEnd := next == '/'
		nameStart := lt + 1
		if isEnd {
			nameStart++
		}
		if !isASCIILetter(byteAt(html, nameStart)) {
			// A lone "<" is text.
			tokens = append(tokens, htmlToken{typ: tokenText, from: lt, to: lt + 1})
			pos = lt + 1
			continue
		}

		name, attrs, to, ok := readTag(html, nameStart)
		if !ok {
			return append(tokens, htmlToken{typ: tokenSkip, from: lt, to: length})
		}
		pos = to
		if isEnd {
			tokens = append(tokens, htmlToken{typ: tokenEnd, from: lt, to: pos, name: name})
			continue
		}
		tokens = append(tokens, htmlToken{typ: tokenStart, from: lt, to: pos, name: name, attrs: attrs})

		if !rawTextTags[name] {
			continue
		}
		closing := -1
		if name != "plaintext" {
			closing = findRawTextEnd(lower, name, pos)
		}
		if closing == -1 {
			return append(tokens, htmlToken{typ: tokenSkip, from: pos, to: length})
		}
		if closing > pos {
			tokens = append(tokens, htmlToken{typ: tokenSkip, from: pos, to: closing})
		}
		pos = closing
	}
	return tokens
}

// byteAt returns the byte at i, or 0 past the end.
func byteAt(s string, i int) byte {
	if i < len(s) {
		return s[i]
	}
	return 0
}
