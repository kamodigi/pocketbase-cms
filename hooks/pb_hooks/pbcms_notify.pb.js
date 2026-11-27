/// <reference path="../pb_data/types.d.ts" />
// pocketbase-cms: tells the site when a record of a collection the CMS manages is created, updated or
// deleted, through the CMS, the API, the dashboard or app.save(), so it can rebuild its pages. Needs
// pbcms/notify.cjs and pbcms/cms.cjs next to this file.
//
// Set both environment variables of PocketBase; without PBCMS_NOTIFY_URL nothing happens:
//
//   PBCMS_NOTIFY_URL     where to POST, e.g. https://www.example.com/api/revalidate
//   PBCMS_NOTIFY_SECRET  sent in the X-Pbcms-Secret header, for the site to check
//
// The JSON body is { "collection": "posts", "action": "create" | "update" | "delete", "old": record or
// null, "new": record or null }: the stored record before and after the change.
//
// The request is sent after the change is committed, and waits at most 10 seconds for the answer. A
// failure (no answer, a status other than 2xx, no secret, an unreadable CMS config) never fails the
// save; it is written to PocketBase's logs. There are no retries.

onRecordCreateExecute(e => require(`${__hooks}/pbcms/notify.cjs`).capture(e, 'create'))
onRecordUpdateExecute(e => require(`${__hooks}/pbcms/notify.cjs`).capture(e, 'update'))
onRecordDeleteExecute(e => require(`${__hooks}/pbcms/notify.cjs`).capture(e, 'delete'))

onRecordAfterCreateSuccess(e => {
	require(`${__hooks}/pbcms/notify.cjs`).deliver(e)
	e.next()
})
onRecordAfterUpdateSuccess(e => {
	require(`${__hooks}/pbcms/notify.cjs`).deliver(e)
	e.next()
})
onRecordAfterDeleteSuccess(e => {
	require(`${__hooks}/pbcms/notify.cjs`).deliver(e)
	e.next()
})

onRecordAfterCreateError(e => {
	require(`${__hooks}/pbcms/notify.cjs`).discard(e)
	e.next()
})
onRecordAfterUpdateError(e => {
	require(`${__hooks}/pbcms/notify.cjs`).discard(e)
	e.next()
})
onRecordAfterDeleteError(e => {
	require(`${__hooks}/pbcms/notify.cjs`).discard(e)
	e.next()
})
