/// <reference path="../pb_data/types.d.ts" />
// pocketbase-cms: GET /api/cms/schema returns, to a signed-in editor (a `users` record with
// role = "editor"), the definitions of the collections the CMS manages. PocketBase's own
// /api/collections is for superusers only. No token: 401. Any other account: 403.
//
// The collections the CMS manages are the ones the site's config names: the keys of `collections`
// and `media.collection`. The config is read on every request from PBCMS_CONFIG_PATH if set, else
// from pb_public/cms/config.json next to pb_data (PocketBase's default layout). Names the schema
// lacks are skipped, and the CMS warns about them. System collections such as _superusers are never
// returned.
//
// Each collection comes as { id, name, type, fields }; fields are PocketBase's own definitions,
// minus hidden ones (an auth collection's password and tokenKey), which the API never returns
// anyway. Rules, indexes and auth settings are left out.

routerAdd('GET', '/api/cms/schema', e => {
	if (!e.auth) throw new UnauthorizedError('Sign in as an editor.')
	if (e.auth.collection().name !== 'users' || e.auth.getString('role') !== 'editor') {
		throw new ForbiddenError('Only editors can read the CMS schema.')
	}

	const configPath =
		$os.getenv('PBCMS_CONFIG_PATH') || $filepath.join($app.dataDir(), '..', 'pb_public', 'cms', 'config.json')
	let config
	try {
		config = JSON.parse(toString($os.readFile(configPath)))
	} catch (error) {
		e.app.logger().error('pbcms: could not read the CMS config', 'path', configPath, 'error', String(error))
		throw new InternalServerError('The CMS config could not be read on the server.')
	}

	const names = new Set()
	if (config && typeof config.collections === 'object' && config.collections !== null) {
		for (const name of Object.keys(config.collections)) names.add(name)
	}
	if (config && config.media && typeof config.media.collection === 'string') names.add(config.media.collection)

	const collections = []
	for (const name of names) {
		let collection
		try {
			collection = e.app.findCachedCollectionByNameOrId(name)
		} catch {
			continue
		}
		// Only by name: an id in the config is not a name the CMS can match.
		if (collection.name !== name || collection.system) continue
		// JSON.stringify goes through PocketBase's own JSON encoding of a collection; structuredClone does not.
		// eslint-disable-next-line unicorn/prefer-structured-clone
		const { fields, id, type } = JSON.parse(JSON.stringify(collection))
		collections.push({ fields: fields.filter(field => !field.hidden), id, name, type })
	}
	return e.json(200, { collections })
})
