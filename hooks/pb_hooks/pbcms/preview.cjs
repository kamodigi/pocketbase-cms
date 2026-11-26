// Helpers for pbcms_preview.pb.js. Load it inside a handler with
// require(`${__hooks}/pbcms/preview.cjs`).

'use strict'

// The `type` claim of a preview token. PocketBase's own tokens use "auth", "file" and so on.
const TOKEN_TYPE = 'pbcms_preview'
const DEFAULT_DURATION = 600

/**
The key that signs an editor's preview tokens. The prefix keeps it apart from the key of the
editor's PocketBase auth tokens (tokenKey + the collection's auth token secret).
@param {core.Record} editor
*/
function signingKey(editor) {
	return `${TOKEN_TYPE}:${editor.tokenKey()}${editor.collection().authToken.secret}`
}

/**
How long a token lasts, in seconds: `value` if it is a positive whole number, else 600.
@param {string} value
*/
function tokenDuration(value) {
	return /^[1-9]\d*$/.test(value) ? Number(value) : DEFAULT_DURATION
}

module.exports = { signingKey, TOKEN_TYPE, tokenDuration }
