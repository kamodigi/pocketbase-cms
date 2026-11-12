import type { ErrorObject } from 'ajv'

import isValidConfig from 'virtual:cms-config-validator'

import type { CmsConfig } from './types'

import { type ConfigIssue, issue, toPointer } from './issues'
import { localizedFieldName } from './localize'
import { statusColumn } from './types'

export type ConfigResult = { config: CmsConfig; ok: true } | { errors: ConfigIssue[]; ok: false }

/**
Checks a parsed cms.config.json against the JSON Schema and the rules the schema cannot express.
*/
export function validateConfig(value: unknown): ConfigResult {
	if (!isValidConfig(value)) {
		return { errors: dedupe((isValidConfig.errors ?? []).flatMap(error => formatSchemaError(error))), ok: false }
	}
	const config = value as CmsConfig
	const errors = checkReferences(config)
	return errors.length > 0 ? { errors, ok: false } : { config, ok: true }
}

function checkReferences(config: CmsConfig): ConfigIssue[] {
	const errors: ConfigIssue[] = []
	const collectionNames = new Set(Object.keys(config.collections))

	// Field names use the locale in lower case with "_" for "-", so "zh-Hans" and "zh-hans" would collide.
	const localeSuffixes = new Map<string, string>()
	const locales = config.locales ?? []
	for (const [index, locale] of locales.entries()) {
		const suffix = localizedFieldName('', locale)
		const earlier = localeSuffixes.get(suffix)
		if (earlier === undefined) localeSuffixes.set(suffix, locale)
		else errors.push(issue(['locales', index], `uses the same field names as "${earlier}"`))
	}

	const navGroups = config.nav ?? []
	for (const [groupIndex, group] of navGroups.entries()) {
		for (const [itemIndex, item] of group.items.entries()) {
			if (!collectionNames.has(item)) {
				errors.push(issue(['nav', groupIndex, 'items', itemIndex], `"${item}" is not a key of "collections"`))
			}
		}
	}

	if (config.media && !collectionNames.has(config.media.collection)) {
		errors.push(issue(['media', 'collection'], `"${config.media.collection}" is not a key of "collections"`))
	}

	for (const [name, collection] of Object.entries(config.collections)) {
		const at = ['collections', name]

		const statusIndex = collection.list?.columns?.indexOf(statusColumn) ?? -1
		if (statusIndex !== -1 && !collection.status) {
			errors.push(issue([...at, 'list', 'columns', statusIndex], `"${statusColumn}" needs "status" on the collection`))
		}

		const side = new Set(collection.form?.side)
		const main = collection.form?.main ?? []
		for (const [index, field] of main.entries()) {
			if (side.has(field)) errors.push(issue([...at, 'form', 'main', index], `"${field}" is also in "form.side"`))
		}

		if (collection.previewUrl !== undefined && !isHttpUrl(collection.previewUrl)) {
			errors.push(issue([...at, 'previewUrl'], 'must be an absolute http or https URL'))
		}

		const fieldConfigs = Object.entries(collection.fields ?? {})
		for (const [field, fieldConfig] of fieldConfigs) {
			if (fieldConfig.localized && !config.locales) {
				errors.push(issue([...at, 'fields', field, 'localized'], 'needs "locales" at the top level'))
			}
		}
	}
	return errors
}

function dedupe(issues: ConfigIssue[]): ConfigIssue[] {
	const seen = new Set<string>()
	return issues.filter(i => {
		const key = `${i.path}\n${i.message}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

function formatSchemaError(error: ErrorObject): ConfigIssue[] {
	const path = error.instancePath
	// Errors inside a oneOf branch only say why that branch failed; the oneOf error itself is clearer.
	if (error.schemaPath.includes('/oneOf/')) return []
	switch (error.keyword) {
		case 'additionalProperties': {
			return [issue(path + toPointer([String(error.params.additionalProperty)]), 'unknown key')]
		}
		case 'const': {
			return [issue(path, `must be ${JSON.stringify(error.params.allowedValue)}`)]
		}
		case 'enum': {
			const allowed = (error.params.allowedValues as unknown[]).map(v => JSON.stringify(v)).join(', ')
			return [issue(path, `must be one of ${allowed}`)]
		}
		case 'oneOf': {
			if (error.schemaPath.startsWith('#/$defs/label/')) {
				return [issue(path, 'must be a non-empty string, or an object of non-empty strings keyed by locale')]
			}
			if (error.schemaPath.endsWith('/status/oneOf')) {
				return [issue(path, 'must set exactly one of "draftField" and "publishedField"')]
			}
			return [issue(path, error.message ?? 'is invalid')]
		}
		case 'required': {
			return [issue(path, `missing required key "${String(error.params.missingProperty)}"`)]
		}
		case 'uniqueItems': {
			return [issue(path, `must not list the same value twice (items ${error.params.j} and ${error.params.i})`)]
		}
		default: {
			return [issue(path, error.message ?? 'is invalid')]
		}
	}
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}
