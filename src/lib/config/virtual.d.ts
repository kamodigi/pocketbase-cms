declare module 'virtual:cms-config-validator' {
	import type { ErrorObject } from 'ajv'

	/**
	Validator compiled from schema/cms.config.schema.json by tools/config-validator.ts.
	*/
	const isValidConfig: ((data: unknown) => boolean) & { errors?: ErrorObject[] | null }
	export default isValidConfig
}
