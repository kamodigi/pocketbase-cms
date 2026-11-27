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

## Installation

Every [release](https://github.com/kamodigi/pocketbase-cms/releases) comes in two forms. Replace `0.1.0` below with the version you want.

**Docker image.** `ghcr.io/kamodigi/pocketbase-cms` holds the built CMS in `/dist`. You never run it; your PocketBase image copies the files out of it:

```dockerfile
COPY --from=ghcr.io/kamodigi/pocketbase-cms:0.1.0 /dist /pb/pb_public/cms
COPY cms.config.json /pb/pb_public/cms/config.json
```

The image holds the CMS only. Take the [PocketBase hooks](#pocketbase-hooks) from the zip of the same version, or use the Go package.

**Zip.** `pocketbase-cms_0.1.0.zip`, attached to the release, holds `cms/` (the built CMS), `pb_hooks/` (the JavaScript hooks) and the license. Copy `cms/` to `pb_public/cms/`, the contents of `pb_hooks/` into your `pb_hooks/`, and your config to `pb_public/cms/config.json`. When you upgrade, replace `pb_public/cms/` as a whole, so no files of the old version are left behind.

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
When the config names a collection or field that your PocketBase schema does not have, the CMS shows a warning at the top of the screen and ignores that setting. It checks this after sign-in, against the schema from `GET /api/cms/schema`.

### Sign-in and navigation

Only `users` accounts with `role = "editor"` can sign in; anyone else is signed out again with a message. If an editor's account is deleted or loses the role, the CMS signs them out on the next start. The session is kept in the browser's local storage, so it survives a reload and signing out in one tab signs out every tab.

"Forgot your password?" calls PocketBase's own password reset request for `users`. PocketBase sends the email, so configure its mail settings (SMTP) and, if you like, the "Reset password" template under the `users` collection's options in the dashboard. The link in the default template opens PocketBase's own page for setting a new password. The CMS shows the same confirmation whether or not the address has an account.

The sidebar lists the collections in `collections`, grouped by `nav`. Collections that `nav` does not list are appended to its last group; without `nav` they form one group in config order. After sign-in the CMS opens the first collection in the sidebar. `icon` takes one of these Lucide icon names, and any other name shows `file-text`: `award`, `bell`, `book-open`, `box`, `briefcase`, `building`, `calendar`, `camera`, `clipboard-list`, `coffee`, `file`, `file-text`, `folder`, `gift`, `globe`, `graduation-cap`, `handshake`, `heart`, `house`, `image`, `images`, `info`, `layers`, `layout-grid`, `link`, `list`, `mail`, `map`, `map-pin`, `megaphone`, `message-square`, `newspaper`, `package`, `pen-line`, `phone`, `quote`, `rss`, `settings`, `shopping-bag`, `star`, `store`, `tag`, `ticket`, `trophy`, `user`, `users`, `utensils`, `video`.

### List screens

A collection's screen is a table of its records.

- **Columns** are `list.columns`, with the labels from `fields`. Without it, the list shows the title field (`titleField`, or the first text field), the publish state if the collection has `status`, and `updated` if it has that field. The title links to the record. Images are shown as thumbnails and related records by name.
- **Search** matches the fields in `list.search` (by default the title field) for the typed text.
- **Filter**: with `status`, the list can be narrowed to published, scheduled (only with `publishedAtField`) or draft records.
- **Sort**: the order is `list.sort`, or else newest `updated` first. Selecting the header of a date column sorts by that date, newest first, and selecting it again reverses the order.
- **Pages** hold `list.perPage` records (30 by default).

The page, search, filter and sort are kept in the URL, so reloading and going back keep them. A localized field shows, searches and sorts the first locale in `locales`. A collection with `singleton: true` has no list: the CMS opens its one record.

### Localized content

For content in several languages, list the content locales in `locales` (the first is the base locale) and keep one PocketBase field per locale, named `<name>_<locale>`: `title_en`, `title_ja`. A locale with a hyphen is written in lower case with an underscore, so `zh-Hans` becomes `title_zh_hans`. Then set `"localized": true` on the base name in `fields` (`"title": { "localized": true }`) and use the base name everywhere else in the config, such as in `titleField`, `form` and `list`.

The edit screen shows such a field as one input with a tab per locale. The tabs of all localized inputs switch together, and the base locale opens first. The tab of a locale whose field is still empty is marked **Empty**; rich text with nothing but empty paragraphs counts as empty, and a switch (`bool`) is never marked. Whether a locale must be filled in follows that field's `required` in PocketBase; when saving is refused, the CMS opens the locale of the first field with an error, and marks the tabs that have one. A locale in `locales` without its field in the schema is reported as a warning, and the input shows only the locales that exist. Shared values such as the slug, dates, images and the publish state are ordinary fields, so a record is published in every language at once. A slug made from a localized title uses the base locale. The language of the CMS itself is chosen separately (see the language menu) and does not change the open tab.

### Relation fields

On the edit screen, a `relation` field shows the chosen records by name. "Choose …" opens a dialog that searches the related collection and picks one record, or several when the field's `maxSelect` is more than 1; several are saved in the order they were chosen.

- **Name**: the field's `displayField`, or else the related collection's `titleField` (or first text field), or else its `name`, `title` or `email`. A record with none of these, or one that PocketBase does not show to the editor, appears as its id.
- **Search** matches that name field and the related collection's `list.search`. Records are in its `list.sort` order.
- **Collections outside the config** (such as `users`) work too. PocketBase's list and view rules decide which of their records an editor can choose, and their names are read from `displayField`, `name`, `title` or `email`.

### Files and images

A `file` field shows its stored files, images as thumbnails, with a button to choose a file (or to replace it, or to add more when the field's `maxSelect` is more than 1). New files are uploaded when you save the record, and removed files are deleted then. A file of a type the field's `mimeTypes` refuses, or larger than its `maxSize`, is not taken.

Images are made smaller in the browser before they are uploaded, by `media.compress`:

```json
{ "media": { "compress": { "maxWidth": 1920, "quality": 0.85, "format": "webp" } } }
```

| Key        | Default | Meaning                                                                                     |
| ---------- | ------- | ------------------------------------------------------------------------------------------- |
| `maxWidth` | `1920`  | Wider images are scaled down to this width; smaller ones are never enlarged                 |
| `quality`  | `0.85`  | From 0 to 1, for WebP and JPEG                                                              |
| `format`   | `webp`  | `webp`, `jpeg`, or `keep` for the original type. A browser that cannot write WebP uses JPEG |

This applies to every `file` field, with or without a media library. GIFs (which may be animated) and SVGs are uploaded as they are, and so is any image whose new type the field's `mimeTypes` refuses. The file name gets the new type's extension.

**The media library.** `media` names one collection, such as the `media` preset, as the library of images that every collection shares. When an image is uploaded to its `fileField`, the CMS saves the image's width and height in `widthField` and `heightField` and its type in `mimeField`, so replacing the image on its edit screen updates them too. A `relation` field to that collection with `widget: "media"` gets an image picker in place of the record picker: it shows the chosen images, and its dialog searches the library by the collection's title field (the alt text in the preset) and `list.search`, shows thumbnails, and uploads a new image with its alt text (required) and caption. The thumbnails use a size from the file field's `thumbs` between 120 and 480 pixels, such as `160x160f`, or else PocketBase's `100x100`. Fields with `autofill`, such as the preset's `uploadedBy`, are filled on upload too.

### Unsaved input

While you type on an edit screen, the CMS keeps the changed fields in the browser's local storage, one draft per editor and record (the new-record screen has one per collection). Opening that screen again asks "You have unsaved changes. Restore them?"; the form can be used once you choose to restore or discard. A restore puts back only the changed fields and sends nothing until you save. Chosen files are not kept, since the browser cannot store them. The draft is removed when you save or delete the record, discard it, or undo the changes yourself. Signing out with the sign-out button removes all of that editor's drafts, so a shared computer keeps no unpublished text. A session that expires keeps them, so no input is lost. If the record has an `updated` field and was saved again after the draft was made, the question says so; you can still restore. If the browser's storage is full or blocked, the screens work without drafts.

### Draft previews on your site

Give a collection a `previewUrl`, the absolute `http` or `https` address of a page on your site, and the edit screen of its saved records gets a **Preview on site** button:

```json
{
	"collections": {
		"news": { "previewUrl": "https://www.example.com/news/preview" }
	}
}
```

A collection without `previewUrl` has no button. It needs the preview hook, `pbcms_preview.pb.js` (see [PocketBase hooks](#pocketbase-hooks)), or the [Go package](#go-package). There is no helper library: your site implements the page from the description below.

**What your page receives.** The button opens a new tab and submits an HTML form to `previewUrl`: a `POST` with an `application/x-www-form-urlencoded` body.

| Field        | Value                                                     |
| ------------ | --------------------------------------------------------- |
| `collection` | The collection's name, such as `news`                     |
| `id`         | The record's id                                           |
| `token`      | A preview token for this one record, valid for 10 minutes |
| `locale`     | The content locale of the open tab, such as `zh-Hans`     |

`locale` is sent only when the edit screen has [localized fields](#localized-content). It is written as in `locales`, and says which language the editor wants to see; the record your page reads still holds every locale.

The values are those of the saved record: changes not saved yet are not shown. More fields may be added later, so ignore the ones you don't know.

**How your page reads the draft.** Call PocketBase with the token:

```http
GET https://pb.example.com/api/cms/preview/news/abc123def456ghi
Authorization: Bearer <token>
```

| Status | Meaning                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------- |
| 200    | The record as PocketBase's record API returns it, drafts included, with `Cache-Control: no-store` |
| 401    | The token is missing, invalid or expired. Ask the editor to open the preview from the CMS again   |
| 403    | The token is for another record                                                                   |
| 404    | The record has been deleted                                                                       |

Relations come as ids. To show related records, read them from PocketBase's record API as your public pages do; the token does not open anything but its one record.

**What your page should do.**

- Accept a cross-origin form `POST`. Many frameworks refuse one by default as CSRF protection, so allow the CMS's origin or exempt this route. Cookies marked `SameSite=Lax` or `Strict` are not sent with it.
- Treat the fields as untrusted input, because anyone can send this form: accept only the collections you have a page for, check the id's format, and always call your own PocketBase, never an address taken from the request.
- Serve the page over HTTPS, keep the token out of URLs and logs, and don't cache or index the page (`Cache-Control: no-store`, `noindex`).
- Show rich text only with the hooks that sanitize it installed (see below).

[`examples/lantern-coffee/preview-site/server.mjs`](examples/lantern-coffee/preview-site/server.mjs) is a small page that does this, with no dependencies. The example config points `posts`, `events` and `about` at it, so with the [development PocketBase](#try-it-with-a-development-pocketbase) running, start it with `node examples/lantern-coffee/preview-site/server.mjs` and press the button. In your own site's config, change or remove those `previewUrl`s.

## PocketBase hooks

The JavaScript hooks are in the release zip's `pb_hooks/` (in this repository, [`hooks/pb_hooks/`](hooks/pb_hooks)). Copy the files you need, together with the `pbcms/` folder they load, into your PocketBase's `pb_hooks/`.

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

`pbcms.Register` replaces all the JavaScript hooks above, so don't install them as well. It reads the same environment variables (`PBCMS_CONFIG_PATH`, `PBCMS_PUBLIC_URL`, `PBCMS_PREVIEW_TOKEN_DURATION`, `PBCMS_NOTIFY_URL`, `PBCMS_NOTIFY_SECRET`):

- It adds `GET /api/cms/schema` and the preview routes (`POST /api/cms/preview/{collection}/{id}/token` and `GET /api/cms/preview/{collection}/{id}`), with the same answers and the same checks. Preview tokens are the same in both, so one issued by the JavaScript hook works with the Go package and the other way round.
- It notifies your site with the same request as `pbcms_notify.pb.js`.
- It sanitizes `editor` fields on save with the same allowlist, and sanitizes them again in responses with image URLs looked up afresh. The Go sanitizer is a port of `hooks/pb_hooks/pbcms/html.cjs`; its tests run both on the same inputs and check that the output is the same.

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

| Collection | Type        | Notes                                                                                                                    |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `posts`    | Article     | Title, slug, rich text body, cover image, category, stores, draft flag and publish date                                  |
| `events`   | Article     | The article type in three languages (`en`, `ja`, `zh-Hans`): localized title and body, shared slug, dates and draft flag |
| `stores`   | List        | Flat records with a select field and a URL                                                                               |
| `about`    | Single page | One record, created by the migration; editors can update it but not create or delete it                                  |
| `media`    | Media       | Image file, required alt text, caption, width and height                                                                 |

- `examples/lantern-coffee/pb_migrations/` holds the JavaScript migrations, including `users.role`. Put them in your PocketBase's `pb_migrations/`.
- `examples/lantern-coffee/cms.config.json` is the matching config. Copy it to `pb_public/cms/config.json`.
- `examples/lantern-coffee/preview-site/` is the page the config's `previewUrl` points at (see [Draft previews on your site](#draft-previews-on-your-site)).
- Every collection has `created` and `updated` (autodate) fields. Collections made by migrations don't get them automatically.

## Releases

The CMS, the JavaScript hooks and the Go package share one version, following [Semantic Versioning](https://semver.org). While the major version is 0, a minor release may break compatibility and a patch release does not; read the release notes before upgrading.

| What             | Name for version 0.1.0                                    |
| ---------------- | --------------------------------------------------------- |
| Git tag          | `v0.1.0` (`go get …/pbcms@v0.1.0` uses it too)            |
| Docker image     | `ghcr.io/kamodigi/pocketbase-cms:0.1.0` (no `latest` tag) |
| Zip on a release | `pocketbase-cms_0.1.0.zip`                                |

The tag is the only place the version is written (`version` in `package.json` stays `0.0.0`). To publish a release, tag a commit on `main` and push the tag:

```sh
git fetch origin
git tag -a v0.1.0 -m v0.1.0 origin/main
git push origin v0.1.0
```

The [release workflow](.github/workflows/release.yml) runs all of CI, then pushes the image (`linux/amd64` and `linux/arm64`) and creates the GitHub release with the zip. A tag with a suffix, such as `v0.1.0-rc.1`, becomes a pre-release. Never move or reuse a published tag: Go's module proxy keeps the first content it saw. Version 2 needs a `/v2` module path in `go.mod` first, so the packaging script refuses it until then.

GHCR creates a new package as private. After the first release, a maintainer has to make it public once, in the package's settings on GitHub.

To try the packaging locally (needs `zip`; the second check needs Docker):

```sh
pnpm build
release/package.sh v0.0.0-dev   # release-out/pocketbase-cms_0.0.0-dev.zip
unzip -q release-out/pocketbase-cms_0.0.0-dev.zip -d release-out/files
docker build -f release/Dockerfile -t pocketbase-cms:check release-out/files
release/verify-image.sh pocketbase-cms:check build
```

## License

[MIT](LICENSE)
