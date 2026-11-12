import { type ConfigResult, validateConfig } from './validate'

/**
Where the CMS reads its config: next to index.html, i.e. pb_public/cms/config.json.
*/
export const configUrl = 'config.json'

/**
Fetches, parses and validates cms.config.json. Never throws; problems come back as errors.
*/
export async function loadConfig(fetchFn: typeof fetch, url: string = configUrl): Promise<ConfigResult> {
	let response: Response
	try {
		// The file changes when the site is redeployed; always revalidate instead of trusting a cached copy.
		response = await fetchFn(url, { cache: 'no-cache' })
	} catch (error) {
		return failure(`Could not fetch ${url}: ${errorMessage(error)}`)
	}
	if (!response.ok) {
		return failure(
			response.status === 404
				? `${url} was not found. Copy your cms.config.json to pb_public/cms/config.json.`
				: `Could not fetch ${url}: HTTP ${response.status}`,
		)
	}

	let value: unknown
	try {
		value = JSON.parse(await response.text())
	} catch (error) {
		return failure(`${url} is not valid JSON: ${errorMessage(error)}`)
	}
	return validateConfig(value)
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function failure(message: string): ConfigResult {
	return { errors: [{ message, path: '' }], ok: false }
}
