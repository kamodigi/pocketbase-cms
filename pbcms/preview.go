package pbcms

import (
	"net/http"
	"os"
	"regexp"
	"strconv"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/security"
)

// Draft previews on the site, without handing the site an editor's token.
//
// POST /api/cms/preview/{collection}/{id}/token: a signed-in editor (a `users` record with
// role = "editor") gets a preview token for one record of a collection the CMS manages (the same
// ones as GET /api/cms/schema). No token: 401. Any other account: 403. A collection the CMS does not
// manage, or a missing record: 404. Answers { token, expiresAt }.
//
// GET /api/cms/preview/{collection}/{id} with `Authorization: Bearer <preview token>`: the record,
// drafts included, as PocketBase's record API would return it (hidden fields left out, OnRecordEnrich
// hooks applied), whatever the collection's view rule says. Without a valid, unexpired token: 401.
// A token for another record: 403. A record deleted since: 404.
//
// A token lasts PBCMS_PREVIEW_TOKEN_DURATION seconds (default 600). It is signed with a key made of
// the editor's tokenKey and the `users` collection's auth token secret, so it stops working at once
// when the editor's password changes, the editor loses the role or is deleted, or those secrets are
// regenerated. It cannot be used as a PocketBase auth token, nor the other way round.
//
// The JavaScript version is hooks/pb_hooks/pbcms_preview.pb.js; both answer the same, and a token
// from one is valid in the other.

// previewTokenType is the `type` claim of a preview token. PocketBase's own tokens use "auth",
// "file" and so on.
const previewTokenType = "pbcms_preview"

const defaultPreviewTokenDuration = 600

var (
	positiveInteger = regexp.MustCompile(`^[1-9]\d*$`)
	bearerPrefix    = regexp.MustCompile(`(?i)^Bearer\s+`)
)

// previewSigningKey is the key that signs an editor's preview tokens. The prefix keeps it apart from
// the key of the editor's PocketBase auth tokens (tokenKey + the collection's auth token secret).
func previewSigningKey(editor *core.Record) string {
	return previewTokenType + ":" + editor.TokenKey() + editor.Collection().AuthToken.Secret
}

// previewTokenDuration is how long a token lasts, in seconds: value if it is a positive whole
// number, else 600.
func previewTokenDuration(value string) int {
	if positiveInteger.MatchString(value) {
		if seconds, err := strconv.Atoi(value); err == nil {
			return seconds
		}
	}
	return defaultPreviewTokenDuration
}

func registerPreviewRoutes(e *core.ServeEvent) {
	e.Router.POST("/api/cms/preview/{collection}/{id}/token", previewTokenHandler)
	// PocketBase (since v0.42) answers 401 to any Authorization header that is not one of its auth
	// tokens, before the handler runs. The handler reads the preview token and verifies it itself.
	e.Router.GET("/api/cms/preview/{collection}/{id}", previewHandler).
		Unbind(apis.DefaultRejectUnknownTokenMiddlewareId)
}

func previewTokenHandler(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Sign in as an editor.", nil)
	}
	if !isEditor(e.Auth) {
		return e.ForbiddenError("Only editors can preview records.", nil)
	}
	names, err := managedCollectionNames(e)
	if err != nil {
		return err
	}
	collection := findManagedCollection(e.App, names, e.Request.PathValue("collection"))
	if collection == nil {
		return e.NotFoundError("The CMS does not manage this collection.", nil)
	}
	record, err := e.App.FindRecordById(collection, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("The record was not found.", nil)
	}

	duration := time.Duration(previewTokenDuration(os.Getenv("PBCMS_PREVIEW_TOKEN_DURATION"))) * time.Second
	claims := map[string]any{
		"collection": collection.Id,
		"editor":     e.Auth.Id,
		"record":     record.Id,
		"type":       previewTokenType,
	}
	token, err := security.NewJWT(claims, previewSigningKey(e.Auth), duration)
	if err != nil {
		return e.InternalServerError("The preview token could not be created.", err)
	}
	expiresAt := time.Now().Add(duration).UTC().Format("2006-01-02T15:04:05.000Z07:00")
	e.Response.Header().Set("Cache-Control", "no-store")
	return e.JSON(http.StatusOK, map[string]string{"expiresAt": expiresAt, "token": token})
}

func previewHandler(e *core.RequestEvent) error {
	token := bearerPrefix.ReplaceAllString(e.Request.Header.Get("Authorization"), "")
	if token == "" {
		return e.UnauthorizedError("A preview token is required.", nil)
	}
	claims := verifyPreviewToken(e.App, token)
	if claims == nil {
		return e.UnauthorizedError("The preview token is invalid or has expired.", nil)
	}

	collection, err := e.App.FindCachedCollectionByNameOrId(e.Request.PathValue("collection"))
	if err != nil || collection.Id != claims["collection"] || e.Request.PathValue("id") != claims["record"] {
		return e.ForbiddenError("The preview token is for another record.", nil)
	}
	record, err := e.App.FindRecordById(collection, claims["record"])
	if err != nil {
		return e.NotFoundError("The record was not found.", nil)
	}

	if err := apis.EnrichRecord(e, record); err != nil {
		return e.InternalServerError("The record could not be loaded.", err)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	return e.JSON(http.StatusOK, record)
}

// verifyPreviewToken returns the collection, record and editor claims of a valid, unexpired preview
// token, or nil.
func verifyPreviewToken(app core.App, token string) map[string]string {
	unverified, err := security.ParseUnverifiedJWT(token)
	if err != nil || unverified["type"] != previewTokenType {
		return nil
	}
	editorId, ok := unverified["editor"].(string)
	if !ok {
		return nil
	}
	editor, err := app.FindRecordById("users", editorId)
	if err != nil || !isEditor(editor) {
		return nil
	}

	verified, err := security.ParseJWT(token, previewSigningKey(editor))
	if err != nil || verified["type"] != previewTokenType || verified["editor"] != editor.Id {
		return nil
	}
	claims := map[string]string{"editor": editor.Id}
	for _, name := range []string{"collection", "record"} {
		value, ok := verified[name].(string)
		if !ok {
			return nil
		}
		claims[name] = value
	}
	return claims
}
