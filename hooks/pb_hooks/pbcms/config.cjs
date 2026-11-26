/// <reference path="../../pb_data/types.d.ts" />
// Shared by the hooks: which collections the CMS manages, as named by the site's cms.config.json.

/**
PBCMS_CONFIG_PATH if set, else pb_public/cms/config.json next to pb_data (PocketBase's default layout).
*/
function configPath() {
	return $os.getenv('PBCMS_CONFIG_PATH') || $filepath.join($app.dataDir(), '..', 'pb_public', 'cms', 'config.json')
}

/**
The names under `collections`, in the config's order, then `media.collection`. Read from disk on every
call. Throws if the file cannot be read or is not JSON.
*/
function managedCollectionNames() {
	const content = $os.readFile(configPath())
	const config = JSON.parse(toString(content))
	const names = new Set()
	if (config && typeof config.collections === 'object' && config.collections !== null) {
		for (const name of Object.keys(config.collections)) names.add(name)
	}
	if (config && config.media && typeof config.media.collection === 'string') names.add(config.media.collection)
	return [...names]
}

module.exports = { configPath, managedCollectionNames }
