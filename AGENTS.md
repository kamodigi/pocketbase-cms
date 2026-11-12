# AGENTS.md

pocketbase-cms is a public, MIT-licensed admin UI for PocketBase: a Svelte 5 + SvelteKit static SPA (hash router, served from `pb_public/cms/`).

## Rules

- This repository is public. Never commit client names, real site data, URLs of client sites, secrets, or anything copied from private repositories. Examples use fictional sites only.
- Code, comments, commit messages and docs are in English. `README.ja.md` mirrors `README.md` in Japanese; update both together.
- Before committing, run `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build`. CI runs the same steps.
- Work on a branch and open a pull request against `main`.
- Do not add `test.skip`, `.only`, or placeholder tests.
