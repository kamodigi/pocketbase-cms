# pocketbase-cms

An admin UI for [PocketBase](https://pocketbase.io) that your clients can use to edit their website's content.
It reads your collection schema at runtime and builds the list and edit screens from it, so each site needs only a small config file instead of its own admin code.

[日本語の README](README.ja.md)

> [!IMPORTANT]
> This is an unofficial project. It is not affiliated with or endorsed by PocketBase.

> [!WARNING]
> Early development. Nothing is usable yet; the editing screens are still being built.

## How it will work

- The CMS is a static single-page app. You copy it into PocketBase's `pb_public/cms/` and open `https://<your-pocketbase>/cms/`.
- Editors sign in with a PocketBase `users` account that has `role = "editor"`. PocketBase's API rules stay the real access control.
- Field inputs come from your collection schema. A `cms.config.json` file next to the app only sets labels, ordering, list columns and similar presentation details.
- A small PocketBase hook (JavaScript `pb_hooks` or a Go package) exposes the schema to editors, sanitizes rich text on save, and can notify your site when content changes.

## Configuration

The CMS reads `config.json` from its own folder, so copy your site's `cms.config.json` to `pb_public/cms/config.json`.
Anyone can download this file; never put secrets in it.

The format is defined by the JSON Schema in [`schema/cms.config.schema.json`](schema/cms.config.schema.json).
Point `$schema` at it to get completion and checks in your editor:

```json
{
	"$schema": "https://raw.githubusercontent.com/kamodigi/pocketbase-cms/main/schema/cms.config.schema.json",
	"version": 1,
	"collections": {
		"news": { "label": { "en": "News", "ja": "お知らせ" }, "titleField": "title" }
	}
}
```

If the file is missing or invalid, the CMS shows the errors instead of the screens.
When the config names a collection or field that your PocketBase schema does not have, the CMS will show a warning at the top of the screen and ignore that setting (once the screens read the schema from `GET /api/cms/schema`).

## PocketBase hooks

The JavaScript hooks live in [`hooks/pb_hooks/`](hooks/pb_hooks). Copy the files you need, together with the `pbcms/` folder they load, into your PocketBase's `pb_hooks/`.

| File                     | What it does                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pbcms_sanitize.pb.js`   | Cleans the HTML of every `editor` field when a record is saved through PocketBase: from the CMS, the API, the dashboard or `app.save()`               |
| `pbcms_media_urls.pb.js` | In API responses, cleans every `editor` field again and points each `<img data-media-id="…">` at the current file of that `media` record              |
| `pbcms_schema.pb.js`     | Adds `GET /api/cms/schema`, which gives signed-in editors the definitions of the collections the CMS manages                                          |
| `pbcms_preview.pb.js`    | Issues short-lived preview tokens to editors and adds `GET /api/cms/preview/{collection}/{id}`, which lets your site read one draft with such a token |
| `pbcms_notify.pb.js`     | POSTs to your site when a record of a collection the CMS manages is created, updated or deleted                                                       |

The sanitizer keeps the tags and attributes the CMS's editor writes (paragraphs, headings, lists, links, images, tables, text alignment and colors) and removes everything else, including scripts, event handlers and `javascript:` URLs. A rich text field longer than 200,000 characters is refused on save.

The CMS stores an image in rich text as `<img src="…" data-media-id="<media record id>" width="…" height="…">`. The stored HTML works on its own; the media hook only rewrites `src` in responses, so replacing a media file or moving PocketBase to a new domain never leaves stale image URLs. It expects a `media` collection with a `file` field, as in the preset. An image whose media record is deleted, or not viewable by the requester, loses its `src` in the response. This only hides the URL in rich text: to really keep a file private, mark the `file` field as protected, since PocketBase serves unprotected files to anyone who knows the URL.

File URLs start with the `PBCMS_PUBLIC_URL` environment variable (for example `https://pb.example.com`), or with the Application URL in PocketBase's settings when the variable is not set. Request headers such as `X-Forwarded-Host` are not used, because clients can forge them.

`GET /api/cms/schema` answers only a `users` record with `role = "editor"`: 401 without a token, 403 for anyone else (superusers included; they have PocketBase's own `/api/collections`). It returns `{ "collections": [{ "id", "name", "type", "fields" }] }` for the collections your config names under `collections`, plus `media.collection`, in that order. The fields are PocketBase's own definitions without hidden fields; rules, indexes and auth settings are left out. Names that PocketBase lacks, and system collections such as `_superusers`, are skipped. The hook reads the config from `pb_public/cms/config.json` next to `pb_data` on every request, so a redeployed config takes effect at once. If your public folder lives elsewhere (`--publicDir`), set `PBCMS_CONFIG_PATH` to the file's path. Without a readable config the endpoint answers 500.

The preview hook lets your site show a draft without ever seeing an editor's token. An editor calls `POST /api/cms/preview/{collection}/{id}/token` and gets `{ "token", "expiresAt" }`: a token for that one record, valid for 10 minutes (set `PBCMS_PREVIEW_TOKEN_DURATION` to a number of seconds to change it). It answers 401 without a sign-in, 403 for anyone but an editor, and 404 for a collection the CMS does not manage (the same ones as `GET /api/cms/schema`) or a missing record. Your site then calls `GET /api/cms/preview/{collection}/{id}` with `Authorization: Bearer <token>` and gets the record as PocketBase's record API returns it, drafts included, whatever the collection's view rule says, with `Cache-Control: no-store`. A missing, invalid or expired token gets 401, a token for another record 403, and a deleted record 404. A token is signed with the editor's own token key, so it stops working when the editor's password changes or the editor loses the role. It is not a PocketBase auth token and cannot be used as one.

Saving through PocketBase is not the only way HTML gets into the database: records saved before the hooks were installed, restored backups, raw SQL, and a hook that changes a value after the sanitizer has run all skip the save-time check. That is why the media hook sanitizes every `editor` field in responses too. Install both hooks, even if you don't use `media`.

### Notifications to your site

`pbcms_notify.pb.js` lets your site rebuild or revalidate its pages when content changes. Set both environment variables of PocketBase; without `PBCMS_NOTIFY_URL` the hook does nothing.

| Variable              | Value                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| `PBCMS_NOTIFY_URL`    | Where to send the notification, such as `https://www.example.com/api/revalidate` |
| `PBCMS_NOTIFY_SECRET` | A long random string that your site checks. Nothing is sent without it           |

It covers the same collections as `GET /api/cms/schema` (the config's `collections` and `media.collection`, never system collections), however the record changes: the CMS, the API, the dashboard or `app.save()`. Each change is one `POST` with the secret in the `X-Pbcms-Secret` header and a JSON body:

```json
{
	"collection": "posts",
	"action": "update",
	"old": { "id": "abc123def456ghi", "slug": "old-slug", "draft": false, "…": "…" },
	"new": { "id": "abc123def456ghi", "slug": "new-slug", "draft": false, "…": "…" }
}
```

`action` is `create`, `update` or `delete`. `old` and `new` are the stored record before and after the change; `old` is `null` for a create and `new` is `null` for a delete. They hold the fields the API returns, without hidden fields, without the email of an auth record that hides it, and without expanded relations. Drafts are notified too, whatever the collection's API rules say. Rich text is as stored, not as the API returns it (see the media hook above), so use the notification to find what changed and read the content to display from the API.

Your endpoint should compare the header with its secret in constant time and answer with a 2xx status. Use its final URL: a redirected request may arrive without its body. PocketBase sends the notification after the change is committed, one at a time, and waits up to 10 seconds for the answer, so a slow endpoint slows down saving. A failure never undoes or fails the save: it is written to PocketBase's logs (Dashboard → Logs) as `pbcms: could not notify the site`, and the notification is not retried.

### Go package

If your PocketBase is built with Go, use the `pbcms` package instead of the JavaScript hooks it replaces. It is built against `ganigeorgiev.com/pocketbase/pocketbase`, PocketBase's module path since v0.41.

```sh
go get github.com/kamodigi/pocketbase-cms/pbcms
```

```go
app := pocketbase.New()
pbcms.Register(app)
```

`pbcms.Register` replaces `pbcms_schema.pb.js`, `pbcms_sanitize.pb.js` and `pbcms_media_urls.pb.js`, with the same answers and the same environment variables (`PBCMS_CONFIG_PATH`, `PBCMS_PUBLIC_URL`): it adds `GET /api/cms/schema`, sanitizes `editor` fields on save with the same allowlist, and sanitizes them again in responses with image URLs looked up afresh. Don't install those three hooks as well. The Go sanitizer is a port of `hooks/pb_hooks/pbcms/html.cjs`; its tests run both on the same inputs and check that the output is the same. The other hooks are not in the package yet: until they are, register PocketBase's `jsvm` plugin and keep `pbcms_preview.pb.js` and `pbcms_notify.pb.js` in `pb_hooks/`, with the `pbcms/` folder they load, as [`tests/gopocketbase/main.go`](tests/gopocketbase/main.go) does.

## Development

Requirements: Node.js 22 or later and pnpm. The Go package needs Go 1.27 or later.

```sh
pnpm install
pnpm dev      # dev server at http://localhost:5173/cms/
pnpm check    # type check
pnpm lint     # prettier + eslint
pnpm test     # unit tests
pnpm build    # static build in build/
go vet ./... && go test ./...   # the Go package
```

### Integration and E2E tests

Both run against a real PocketBase: the official binary at the version in `compose.yaml` (downloaded once from [PocketBase's releases](https://ganigeorgiev.com/pocketbase/pocketbase/releases) into `node_modules/.cache/pocketbase/` and checked against the release's checksums), with the example presets, the dev accounts and a fresh data directory that is deleted afterwards. Docker is not needed.

```sh
pnpm test:integration                  # API rules and hooks, in tests/integration/
pnpm exec playwright install chromium  # once, before the first E2E run
pnpm build && pnpm test:e2e            # the built CMS in pb_public/cms/, in tests/e2e/
```

With `PBCMS_POCKETBASE=go`, the same tests run against a PocketBase built with Go and the `pbcms` package from `tests/gopocketbase/` (it needs Go) in place of the official binary, without the JavaScript hooks the package replaces. CI runs both.

```sh
PBCMS_POCKETBASE=go pnpm test:integration
```

The E2E tests serve PocketBase on port 8091; set `E2E_PORT` to use another.

To try the build with a real PocketBase, copy `build/` to `pb_public/cms/` and run `pocketbase serve`.

UI text lives in `messages/en.json` and `messages/ja.json` ([Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)); the compiled functions in `src/paraglide/` are generated by `pnpm install` and `pnpm dev`/`pnpm build`. The UI language is the user's choice, then the browser's language, then English.

## Try it with a development PocketBase

A `compose.yaml` runs the official PocketBase binary (v0.42.3; only the latest minor version is supported, and `go.mod` names the same version) with the example presets in `examples/`. It needs Docker Compose.

```sh
docker compose up -d --build   # PocketBase at http://localhost:8090
pnpm install
pnpm dev                       # CMS at http://localhost:5173/cms/
```

Sign in at the CMS with `editor@example.com` / `password1234`. The PocketBase dashboard at <http://localhost:8090/_/> takes `admin@example.com` / `password1234`. These accounts come from `dev/pb_migrations/` and exist for local development only. The development PocketBase also runs the hooks in `hooks/pb_hooks/`.

`pnpm dev` proxies `/api` and `/cms/config.json` to PocketBase (set `POCKETBASE_URL` to use another address). Data lives in a Docker volume; `docker compose down -v` deletes it, and the next `up` starts from the presets again. Migrations are copied in when the container starts, so run `docker compose restart` after editing them.

### Presets

`examples/lantern-coffee/` describes a fictional coffee roaster. Each preset directory holds its migrations and a `cms.config.json`. Copy what you need into your own site.

| Collection | Type        | Notes                                                                                   |
| ---------- | ----------- | --------------------------------------------------------------------------------------- |
| `posts`    | Article     | Title, slug, rich text body, cover image, category, draft flag and publish date         |
| `stores`   | List        | Flat records with a select field and a URL                                              |
| `about`    | Single page | One record, created by the migration; editors can update it but not create or delete it |
| `media`    | Media       | Image file, required alt text, caption, width and height                                |

- `examples/lantern-coffee/pb_migrations/` holds the JavaScript migrations, including `users.role`. Put them in your PocketBase's `pb_migrations/`.
- `examples/lantern-coffee/cms.config.json` is the matching config. Copy it to `pb_public/cms/config.json`.
- Every collection has `created` and `updated` (autodate) fields. Collections made by migrations don't get them automatically.

## License

[MIT](LICENSE)
