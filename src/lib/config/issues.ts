/**
A problem in cms.config.json. `path` is a JSON Pointer into the config ("" is the whole file).
*/
export interface ConfigIssue {
	message: string
	path: string
}

export function issue(path: (number | string)[] | string, message: string): ConfigIssue {
	return { message, path: typeof path === 'string' ? path : toPointer(path) }
}

export function toPointer(segments: (number | string)[]): string {
	return segments.map(s => '/' + String(s).replaceAll('~', '~0').replaceAll('/', '~1')).join('')
}
