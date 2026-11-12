// Test only: reads and writes a post's body with raw SQL, bypassing the hooks. Writing is what a
// restore or a manual fix does; reading shows the stored value, which API responses never do.
// Superusers only.
routerAdd(
	'GET',
	'/test/raw-post-body/{id}',
	e => {
		const row = new DynamicModel({ body: '' })
		$app
			.db()
			.newQuery('SELECT body FROM posts WHERE id = {:id}')
			.bind({ id: e.request.pathValue('id') })
			.one(row)
		return e.json(200, { body: row.body })
	},
	$apis.requireSuperuserAuth(),
)

routerAdd(
	'POST',
	'/test/raw-post-body/{id}',
	e => {
		$app
			.db()
			.newQuery('UPDATE posts SET body = {:body} WHERE id = {:id}')
			.bind({ body: e.requestInfo().body.body, id: e.request.pathValue('id') })
			.execute()
		return e.noContent(204)
	},
	$apis.requireSuperuserAuth(),
)
