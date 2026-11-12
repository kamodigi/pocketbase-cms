/// <reference types="node" />

import type { Plugin } from 'vite'

import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
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

/**
Also, during `pnpm dev`, serves the file named by the CMS_CONFIG environment variable at
/cms/config.json, so you can try a config without copying it into the app.
*/
export function configValidator(): Plugin {
	return {
		configureServer(server) {
			const configPath = process.env.CMS_CONFIG
			if (!configPath) return
			server.middlewares.use('/cms/config.json', async (_request, response) => {
				try {
					const body = await readFile(path.resolve(configPath), 'utf8')
					response.setHeader('Content-Type', 'application/json')
					response.end(body)
				} catch (error) {
					server.config.logger.error(`CMS_CONFIG: cannot read ${path.resolve(configPath)}: ${String(error)}`)
					response.statusCode = 500
					response.end()
				}
			})
		},
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
