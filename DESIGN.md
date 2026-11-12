# Design

The source of truth for how pocketbase-cms looks. Decisions only; the values live in `src/routes/layout.css`.

## Decisions

- **Stack**: Tailwind CSS v4 and [shadcn-svelte](https://www.shadcn-svelte.com) (Bits UI). Component source is copied into `src/lib/components/ui/` and kept in upstream style (it is excluded from ESLint and Prettier so it can be diffed against upstream). Icons are [Lucide](https://lucide.dev) (`@lucide/svelte`).
- **Direction "paper"**: quiet, print-like neutrals with a slight yellow cast. No web fonts; the system UI font is used (Hiragino Sans, Noto Sans JP, Yu Gothic for Japanese). Body text is 16px with a line height of 1.7.
- **Default accent**: turquoise `#0a7f99`. **Radius**: 4px. **Density**: standard.
- **Dark mode**: follows the OS by default and can be switched from the top bar (`ThemeToggle`, backed by `mode-watcher`).
- **Accessibility**: WCAG 2.2 AA. Everything is keyboard operable with a visible focus ring (`--ring`); there is a skip link in the shell.

## Tokens

Two layers, both in `src/routes/layout.css`.

1. **Paper ramp** `--paper-0 … --paper-900`: raw colors, light to dark. Only the role layer references them.
2. **Role tokens** (shadcn-svelte names): `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--accent` (hover and selected fill, not the brand color), `--border`, `--input`, `--ring`, `--destructive`, `--sidebar*`, plus ours: `--link`, `--brand-subtle`, `--success`, `--success-subtle`, `--warning`, `--warning-subtle`, `--warning-foreground`.

**Components use role tokens only** (`bg-card`, `text-muted-foreground`, `border-border`, ...), never the paper ramp or hex values. `.dark` redefines the role tokens, so a component needs no `dark:` variants for color.

Radius is one base, `--radius` (4px); `rounded-md`/`rounded-lg` equal it, `rounded-xl` is 1.25×, `rounded-2xl` 1.5×.

## Brand overrides

`cms.config.json` may set `brand.name`, `brand.logo`, `brand.favicon` and `brand.accent` (a `#rrggbb` color). Nothing else about the look is configurable.

`brand.accent` is turned into six variables by `src/lib/theme/brand.ts` (`--brand`, `--brand-fg`, `--brand-dark`, `--brand-dark-fg`, `--brand-text`, `--brand-text-dark`), which feed `--primary`, `--ring`, `--link` and the sidebar:

- The text color on the accent (`--brand-fg`) is white or near-black, whichever has more contrast.
- In dark mode the accent is lightened 18% towards white.
- Link text is moved towards black (light) or white (dark) until it reaches 4.5:1 on the page and on the selected-row fill. The default accent's link color is therefore slightly darker than the accent itself.
- The CMS shows a warning above the screen when the accent, as a button or focus ring, is below 3:1 against the page, or the label on it is below 4.5:1. The accent is still used.

The defaults in `layout.css` equal what `brandTokens('#0a7f99')` computes; `brand.test.ts` fails if they drift.

Note: `#0a7f99` on white is 4.66:1 (not 4.9:1 as first estimated). That passes AA for text; on the page background `#fbfaf7` it is 4.46:1, which is why links use the derived `--brand-text`.

## Components

Browse them at `/cms/#/styleguide` in `pnpm dev` (the page is not included in production builds). It shows tokens, buttons, inputs, select, textarea, badges, table, dialog and toasts, and is itself rendered inside the app shell. Switch light/dark in the top bar.

| Need                                                    | Use                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Page frame (sidebar, top bar, skip link, mobile drawer) | `AppShell` in `src/lib/layout/app-shell.svelte`; pass `name`, `logo`, `nav` groups, and `breadcrumb`/`actions`/`footer` snippets                |
| Buttons                                                 | `Button` (`variant`: default, secondary, outline, ghost, destructive, link; `size`: default, sm, lg, icon). Icon-only buttons need `aria-label` |
| Text inputs                                             | `Label` + `Input` / `Textarea`; link help text with `aria-describedby`; set `aria-invalid="true"` for errors and show the message as text       |
| Choice from a list                                      | `Select` (Bits UI). Arrow keys and type-ahead work                                                                                              |
| Tabular data                                            | `Table` inside a `bg-card rounded-xl border` wrapper with `overflow-x-auto`. Give it a (visually hidden) `Table.Caption`                        |
| Status                                                  | `Badge`. Published: `bg-success-subtle text-success`; scheduled: `bg-brand-subtle text-link`; draft: `variant="secondary"`                      |
| Confirm / modal                                         | `Dialog`. Focus is trapped and Esc closes; put the destructive action on the right of `Dialog.Footer`                                           |
| Notifications                                           | `toast.success/error/info` from `svelte-sonner`; `<Toaster>` is mounted once in the root layout. Don't rely on color alone: say what happened   |
| Theme switch                                            | `ThemeToggle` (already in `AppShell`)                                                                                                           |

Add another shadcn-svelte component with `pnpm dlx shadcn-svelte@latest add <name>` (see `components.json`), then format it with Prettier.
