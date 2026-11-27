/**
What the list screen shows. It lives in the URL, so going back or reloading keeps it.
*/
export interface ListQuery {
	page: number
	search: string
	/**
	A sort the user chose, such as `-updated`; empty for the configured order.
	*/
	sort: string
	/**
	Empty for every state.
	*/
	status: '' | PublishState
}

export type PublishState = 'draft' | 'published' | 'scheduled'

export const publishStates: readonly PublishState[] = ['published', 'scheduled', 'draft']

/**
Reads the query from a URL hash such as `#/collections/posts?page=2`. Hand-edited values that make no
sense are dropped.
*/
export function parseListQuery(hash: string): ListQuery {
	const start = hash.indexOf('?')
	const parameters = new URLSearchParams(start === -1 ? '' : hash.slice(start + 1))
	const page = Number(parameters.get('page') ?? 1)
	return {
		page: Number.isSafeInteger(page) && page > 0 ? page : 1,
		search: decodeText(parameters.get('q') ?? ''),
		sort: parameters.get('sort') ?? '',
		status: publishStates.find(state => state === parameters.get('status')) ?? '',
	}
}

/**
The query string for a list URL, with its "?"; empty for the first page of the unfiltered list.
*/
export function serializeListQuery({ page, search, sort, status }: ListQuery): string {
	const parameters = new URLSearchParams()
	if (search !== '') parameters.set('q', encodeText(search))
	if (status !== '') parameters.set('status', status)
	if (sort !== '') parameters.set('sort', sort)
	if (page > 1) parameters.set('page', String(page))
	const query = parameters.toString()
	return query === '' ? '' : `?${query}`
}

function decodeText(text: string): string {
	try {
		return decodeURIComponent(text.replaceAll('*', '%'))
	} catch {
		return text
	}
}

/**
SvelteKit runs decodeURIComponent over the whole hash when the app starts, but not when it navigates.
Free text is therefore written with "*" in place of "%" (URLSearchParams leaves "*" as it is), so both
read it the same.
*/
function encodeText(text: string): string {
	// encodeURIComponent leaves these as they are, but "*" is taken here and URLSearchParams encodes the rest.
	const encoded = encodeURIComponent(text.toWellFormed()).replaceAll(
		/[!'()*~]/g,
		character => `%${character.codePointAt(0)!.toString(16).toUpperCase()}`,
	)
	return encoded.replaceAll('%', '*')
}
