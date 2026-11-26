/// <reference path="../../pb_data/types.d.ts" />
// The work of pbcms_notify.pb.js, which describes the behavior.
//
// A change is captured while it is written (the *Execute hooks), where the row before it is still in
// the database, and sent from the after-success hooks, which run once the transaction is committed.
// record.original() cannot be used instead: PocketBase does not refresh it when a record instance is
// saved, so a hook that saves one twice would report the wrong previous values. In between, the change
// waits on the record instance as custom data, which API responses leave out. It is a queue because a
// transaction may save one instance several times before the first after-success hook runs.

const queueKey = 'pbcmsNotifyQueue'
const timeoutSeconds = 10

/**
Runs an *Execute hook: calls e.next() and queues the change if it has to be notified. Only e.next()
may fail the save.

@param {core.RecordEvent} e
@param {'create' | 'update' | 'delete'} action
*/
function capture(e, action) {
	let change
	try {
		if (isNotified(e)) {
			// null, not undefined: both keys are always in the JSON body.
			// eslint-disable-next-line unicorn/no-null
			change = { action, collection: e.record.collection().name, old: null }
			if (action !== 'create') change.old = storedRecord(e.app, e.record.collection(), e.record.lastSavedPK())
		}
	} catch (error) {
		change = undefined
		logFailure(e, action, error)
	}

	e.next()
	if (!change) return

	try {
		// eslint-disable-next-line unicorn/no-null
		change.new = action === 'delete' ? null : storedRecord(e.app, e.record.collection(), e.record.id)
		const queue = readQueue(e.record)
		queue.push(change)
		e.record.set(queueKey, JSON.stringify(queue))
	} catch (error) {
		logFailure(e, action, error)
	}
}

/**
Sends the oldest queued change of the record. Never throws: the change is already saved.

@param {core.RecordEvent} e
*/
function deliver(e) {
	let change
	try {
		const queue = readQueue(e.record)
		change = queue.shift()
		if (!change) return
		e.record.set(queueKey, JSON.stringify(queue))

		const response = $http.send({
			body: JSON.stringify({
				action: change.action,
				collection: change.collection,
				new: change.new,
				old: change.old,
			}),
			headers: {
				'content-type': 'application/json',
				'x-pbcms-secret': $os.getenv('PBCMS_NOTIFY_SECRET'),
			},
			method: 'POST',
			timeout: timeoutSeconds,
			url: $os.getenv('PBCMS_NOTIFY_URL'),
		})
		if (response.statusCode < 200 || response.statusCode >= 300) {
			logFailure(e, change.action, `the site answered ${response.statusCode}`)
		}
	} catch (error) {
		logFailure(e, change ? change.action : 'unknown', error)
	}
}

/**
Drops queued changes after a failed save or a rolled back transaction.

@param {core.RecordEvent} e
*/
function discard(e) {
	e.record.set(queueKey, '')
}

/**
Whether PBCMS_NOTIFY_URL is set and the CMS manages the record's collection. Throws if the config
cannot be read, or if the URL is set without PBCMS_NOTIFY_SECRET: nothing is sent unauthenticated.
*/
function isNotified(e) {
	if (!$os.getenv('PBCMS_NOTIFY_URL')) return false
	const collection = e.record.collection()
	if (collection.system) return false
	const { managedCollectionNames } = require(`${__hooks}/pbcms/config.cjs`)
	if (!managedCollectionNames().includes(collection.name)) return false
	if (!$os.getenv('PBCMS_NOTIFY_SECRET')) throw new Error('PBCMS_NOTIFY_SECRET is not set')
	return true
}

function logFailure(e, action, error) {
	e.app
		.logger()
		.error(
			'pbcms: could not notify the site',
			'collection',
			e.record.collection().name,
			'record',
			e.record.id,
			'action',
			action,
			'error',
			String(error),
		)
}

function readQueue(record) {
	const queue = record.getString(queueKey)
	return queue === '' ? [] : JSON.parse(queue)
}

/**
The record as it is in the database now, in the shape the API returns it: without hidden fields, and
without the email of an auth record that does not show it.
*/
function storedRecord(app, collection, id) {
	// JSON.stringify goes through PocketBase's own JSON encoding of a record; structuredClone does not.
	// eslint-disable-next-line unicorn/prefer-structured-clone
	return JSON.parse(JSON.stringify(app.findRecordById(collection, id)))
}

module.exports = { capture, deliver, discard }
