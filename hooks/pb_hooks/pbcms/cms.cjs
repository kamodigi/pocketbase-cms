// Shared helpers for the pocketbase-cms hooks: who counts as an editor, and which collections the
// CMS manages. Load it inside a handler with require(`${__hooks}/pbcms/cms.cjs`).

'use strict'

/**
The collection called `name` if the CMS manages it, else undefined. Only by name, never by id, and
never a system collection such as _superusers.
@param {core.App} app
@param {Set<string>} names from managedCollectionNames
@param {string} name
@returns {core.Collection | undefined}
*/
function findManagedCollection(app, names, name) {
	if (!names.has(name)) return
	let collection
	try {
		collection = app.findCachedCollectionByNameOrId(name)
	} catch {
		return
	}
	if (collection.name !== name || collection.system) return
	return collection
}

/**
Whether `record` is a signed-in editor: a `users` record with role = "editor".
@param {core.Record | null | undefined} record
*/
function isEditor(record) {
	return !!record && record.collection().name === 'users' && record.getString('role') === 'editor'
}

/**
The names of the collections the CMS manages: the keys of the config's `collections`, then
`media.collection`, in that order. The config is read on every call from PBCMS_CONFIG_PATH if set,
else from pb_public/cms/config.json next to pb_data (PocketBase's default layout). Throws an
InternalServerError if the config cannot be read.
@param {core.App} app
@returns {Set<string>}
*/
function managedCollectionNames(app) {
	const configPath =
		$os.getenv('PBCMS_CONFIG_PATH') || $filepath.join(app.dataDir(), '..', 'pb_public', 'cms', 'config.json')
	let config
	try {
		config = JSON.parse(toString($os.readFile(configPath)))
	} catch (error) {
		app.logger().error('pbcms: could not read the CMS config', 'path', configPath, 'error', String(error))
		throw new InternalServerError('The CMS config could not be read on the server.')
	}

	const names = new Set()
	if (config && typeof config.collections === 'object' && config.collections !== null) {
		for (const name of Object.keys(config.collections)) names.add(name)
	}
	if (config && config.media && typeof config.media.collection === 'string') names.add(config.media.collection)
	return names
}

module.exports = { findManagedCollection, isEditor, managedCollectionNames }
