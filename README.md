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

`pnpm dev` serves the file named by the `CMS_CONFIG` environment variable as `/cms/config.json`, e.g. `CMS_CONFIG=path/to/cms.config.json pnpm dev`.

To try the build with a real PocketBase, copy `build/` to `pb_public/cms/` and run `pocketbase serve`.

## License

[MIT](LICENSE)
