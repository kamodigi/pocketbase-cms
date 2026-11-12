import { includeIgnoreFile } from '@eslint/compat'
import js from '@eslint/js'
import { loadConfig } from '@sveltejs/load-config'
import prettierConfig from 'eslint-config-prettier'
import perfectionist from 'eslint-plugin-perfectionist'
import svelte from 'eslint-plugin-svelte'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import { fileURLToPath } from 'node:url'
import ts from 'typescript-eslint'

const loadedConfig = await loadConfig('./', { traverse: false })
const svelteConfig = loadedConfig?.config

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	perfectionist.configs['recommended-natural'],
	eslintPluginUnicorn.configs['recommended'],
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			// typescript-eslint recommends turning no-undef off for TypeScript projects.
			// https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				projectService: true,
				svelteConfig,
			},
		},
		rules: {
			// In Svelte 5, $state is declared at the top level and assigned inside handlers and effects.
			'unicorn/no-top-level-assignment-in-function': 'off',
		},
	},
	{
		rules: {
			// Renames framework types such as SvelteKit's LayoutProps; the churn outweighs the benefit.
			'unicorn/name-replacements': 'off',
		},
	},
	prettierConfig,
)
