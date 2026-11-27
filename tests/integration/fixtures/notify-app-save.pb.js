// Test only: saves posts from a hook, as a site's own code might, with the same record instance
// saved more than once.

routerAdd('POST', '/test/notify/{slug}', e => {
	const record = new Record(e.app.findCollectionByNameOrId('posts'))
	record.set('slug', e.request.pathValue('slug'))
	const save = (app, title) => {
		record.set('title', title)
		app.save(record)
	}

	save(e.app, 'first')
	save(e.app, 'second')
	e.app.runInTransaction(tx => {
		save(tx, 'third')
		save(tx, 'fourth')
	})
	try {
		e.app.runInTransaction(tx => {
			save(tx, 'rolled back')
			throw new Error('roll back')
		})
	} catch {
		// Expected. The rolled back title must never be notified.
	}
	// A rollback leaves the instance holding values the database does not have; saving sets them anew.
	save(e.app, 'fifth')
	record.set('title', 'never saved')
	e.app.delete(record)
	return e.json(200, { id: record.id })
})
