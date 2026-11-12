/// <reference path="../pb_data/types.d.ts" />
// Development only. Creates a superuser and an editor with well-known passwords on the first start,
// so the CMS can be tried right away. Never copy this file into a real site.
migrate(
	app => {
		const password = 'password1234'

		const superuser = new Record(app.findCollectionByNameOrId('_superusers'))
		superuser.set('email', 'admin@example.com')
		superuser.set('password', password)
		app.save(superuser)

		const editor = new Record(app.findCollectionByNameOrId('users'))
		editor.set('email', 'editor@example.com')
		editor.set('password', password)
		editor.set('verified', true)
		editor.set('name', 'Example Editor')
		editor.set('role', 'editor')
		app.save(editor)
	},
	app => {
		app.delete(app.findAuthRecordByEmail('_superusers', 'admin@example.com'))
		app.delete(app.findAuthRecordByEmail('users', 'editor@example.com'))
	},
)
