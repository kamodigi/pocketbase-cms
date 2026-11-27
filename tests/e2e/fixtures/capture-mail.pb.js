// Test only: keeps the password reset emails PocketBase would send, instead of sending them, and
// lists them at GET /test/mails for superusers.
onMailerRecordPasswordResetSend(e => {
	const mails = JSON.parse($app.store().get('test.mails') || '[]')
	const to = []
	for (let index = 0; index < e.message.to.length; index++) to.push(e.message.to[index].address)
	mails.push({ html: e.message.html, subject: e.message.subject, to })
	$app.store().set('test.mails', JSON.stringify(mails))
	// No e.next(): the test machine has no mail server.
}, 'users')

routerAdd(
	'GET',
	'/test/mails',
	e => e.json(200, JSON.parse($app.store().get('test.mails') || '[]')),
	$apis.requireSuperuserAuth(),
)
