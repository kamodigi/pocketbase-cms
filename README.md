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
When the config names a collection or field that your PocketBase schema does not have, the CMS will show a warning at the top of the screen and ignore that setting (once the schema hook is in place).

## Development

Requirements: Node.js 22 or later and pnpm.

```sh
pnpm install
pnpm dev      # dev server at http://localhost:5173/cms/
pnpm check    # type check
pnpm lint     # prettier + eslint
pnpm test     # unit tests
pnpm build    # static build in build/
```

To try the build with a real PocketBase, copy `build/` to `pb_public/cms/` and run `pocketbase serve`.

## Try it with a development PocketBase

A `compose.yaml` runs the official PocketBase binary (v0.40.6; only the latest minor version is supported) with the example presets in `examples/`. It needs Docker Compose.

```sh
docker compose up -d --build   # PocketBase at http://localhost:8090
pnpm install
pnpm dev                       # CMS at http://localhost:5173/cms/
```

Sign in at the CMS with `editor@example.com` / `password1234`. The PocketBase dashboard at <http://localhost:8090/_/> takes `admin@example.com` / `password1234`. These accounts come from `dev/pb_migrations/` and exist for local development only.

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
