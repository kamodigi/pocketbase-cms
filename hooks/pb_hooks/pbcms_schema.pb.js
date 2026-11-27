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
// anyway. Rules, indexes and auth settings are left out. Needs pbcms/cms.cjs next to this file.

routerAdd('GET', '/api/cms/schema', e => {
	if (!e.auth) throw new UnauthorizedError('Sign in as an editor.')
	const cms = require(`${__hooks}/pbcms/cms.cjs`)
	if (!cms.isEditor(e.auth)) throw new ForbiddenError('Only editors can read the CMS schema.')

	const names = cms.managedCollectionNames(e.app)
	const collections = []
	for (const name of names) {
		const collection = cms.findManagedCollection(e.app, names, name)
		if (!collection) continue
		// JSON.stringify goes through PocketBase's own JSON encoding of a collection; structuredClone does not.
		// eslint-disable-next-line unicorn/prefer-structured-clone
		const { fields, id, type } = JSON.parse(JSON.stringify(collection))
		collections.push({ fields: fields.filter(field => !field.hidden), id, name, type })
	}
	return e.json(200, { collections })
})
