/// <reference types="node" />

import type { Plugin } from 'vite'

import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const schemaPath = fileURLToPath(new URL('../schema/cms.config.schema.json', import.meta.url))
const moduleId = 'virtual:cms-config-validator'
const resolvedId = `\0${moduleId}`

/**
Compiles schema/cms.config.schema.json to a standalone validator at build time and serves it as
`virtual:cms-config-validator`. The browser gets plain functions, so Ajv never runs `new Function`
there, and the JSON Schema stays the single source of truth.
*/
export function compileConfigValidator(): string {
	const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'))
	// strictRequired would reject `required` inside oneOf branches (status.draftField / publishedField).
	// `format` is kept as an annotation for editors; previewUrl is checked in validate.ts instead.
	const ajv = new Ajv2020({
		allErrors: true,
		code: { esm: true, source: true },
		strict: true,
		strictRequired: false,
		validateFormats: false,
	})
	const code = standaloneCode(ajv, ajv.compile(schema as object))
	// Even with `esm: true`, Ajv emits `require()` for its runtime helpers. Turn them into imports.
	const imports: string[] = []
	const body = code.replaceAll(
		/const (\w+) = require\(("[^"]+")\)\.default;/g,
		(_, name: string, specifier: string) => {
			imports.push(`import ${name} from ${specifier};`)
			return ''
		},
	)
	if (body.includes('require(')) throw new Error('Unhandled require() in the generated config validator')
	return imports.join('') + body.replace(/^"use strict";/, '')
}

export function configValidator(): Plugin {
	return {
		load(id) {
			if (id !== resolvedId) return
			// Rollup plugin hooks get their context as `this`.
			// eslint-disable-next-line unicorn/no-this-outside-of-class
			this.addWatchFile(schemaPath)
			return compileConfigValidator()
		},
		name: 'cms-config-validator',
		resolveId(id) {
			if (id === moduleId) return resolvedId
		},
	}
}
