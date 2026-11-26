/// <reference path="../pb_data/types.d.ts" />
// pocketbase-cms: draft previews on the site, without handing the site an editor's token.
//
// POST /api/cms/preview/{collection}/{id}/token: a signed-in editor (a `users` record with
// role = "editor") gets a preview token for one record of a collection the CMS manages (see
// pbcms_schema.pb.js). No token: 401. Any other account: 403. A collection the CMS does not manage,
// or a missing record: 404. Answers { token, expiresAt }.
//
// GET /api/cms/preview/{collection}/{id} with `Authorization: Bearer <preview token>`: the record,
// drafts included, as PocketBase's record API would return it (hidden fields left out, the media
// hook applied), whatever the collection's view rule says. Without a valid, unexpired token: 401. A
// token for another record: 403. A record deleted since: 404.
//
// A token lasts PBCMS_PREVIEW_TOKEN_DURATION seconds (default 600). It is signed with a key made of
// the editor's tokenKey and the `users` collection's auth token secret, so it stops working at once
// when the editor's password changes, the editor loses the role or is deleted, or those secrets are
// regenerated. It cannot be used as a PocketBase auth token, nor the other way round. Needs
// pbcms/cms.cjs next to this file.

routerAdd('POST', '/api/cms/preview/{collection}/{id}/token', e => {
	if (!e.auth) throw new UnauthorizedError('Sign in as an editor.')
	const cms = require(`${__hooks}/pbcms/cms.cjs`)
	if (!cms.isEditor(e.auth)) throw new ForbiddenError('Only editors can preview records.')
	const preview = require(`${__hooks}/pbcms/preview.cjs`)

	const name = e.request.pathValue('collection')
	const collection = cms.findManagedCollection(e.app, cms.managedCollectionNames(e.app), name)
	if (!collection) throw new NotFoundError('The CMS does not manage this collection.')
	let record
	try {
		record = e.app.findRecordById(collection, e.request.pathValue('id'))
	} catch {
		throw new NotFoundError('The record was not found.')
	}

	const duration = preview.tokenDuration($os.getenv('PBCMS_PREVIEW_TOKEN_DURATION'))
	const claims = { collection: collection.id, editor: e.auth.id, record: record.id, type: preview.TOKEN_TYPE }
	const token = $security.createJWT(claims, preview.signingKey(e.auth), duration)
	const expiresAt = new Date(Date.now() + duration * 1000).toISOString()
	e.response.header().set('Cache-Control', 'no-store')
	return e.json(200, { expiresAt, token })
})

routerAdd('GET', '/api/cms/preview/{collection}/{id}', e => {
	const token = e.request.header.get('Authorization').replace(/^Bearer\s+/i, '')
	if (token === '') throw new UnauthorizedError('A preview token is required.')
	const cms = require(`${__hooks}/pbcms/cms.cjs`)
	const preview = require(`${__hooks}/pbcms/preview.cjs`)
	const claims = verifyToken(e.app, token)
	if (!claims) throw new UnauthorizedError('The preview token is invalid or has expired.')

	let collection
	try {
		collection = e.app.findCachedCollectionByNameOrId(e.request.pathValue('collection'))
	} catch {
		collection = undefined
	}
	if (!collection || collection.id !== claims.collection || e.request.pathValue('id') !== claims.record) {
		throw new ForbiddenError('The preview token is for another record.')
	}
	let record
	try {
		record = e.app.findRecordById(collection, claims.record)
	} catch {
		throw new NotFoundError('The record was not found.')
	}

	$apis.enrichRecord(e, record)
	e.response.header().set('Cache-Control', 'no-store')
	return e.json(200, record)

	/**
	The claims of a valid, unexpired preview token, or undefined.
	@param {core.App} app
	@param {string} value
	*/
	function verifyToken(app, value) {
		let editor
		try {
			const unverified = $security.parseUnverifiedJWT(value)
			if (unverified.type !== preview.TOKEN_TYPE || typeof unverified.editor !== 'string') return
			editor = app.findRecordById('users', unverified.editor)
		} catch {
			return
		}
		if (!cms.isEditor(editor)) return
		try {
			const verified = $security.parseJWT(value, preview.signingKey(editor))
			const isValid =
				verified.type === preview.TOKEN_TYPE &&
				verified.editor === editor.id &&
				typeof verified.collection === 'string' &&
				typeof verified.record === 'string'
			return isValid ? verified : undefined
		} catch {
			return
		}
	}
})
