/// <reference path="../pb_data/types.d.ts" />
migrate(
	app => {
		const users = app.findCollectionByNameOrId('users')

		users.fields.add(
			new SelectField({
				id: 'usr_role',
				name: 'role',
				maxSelect: 1,
				values: ['editor'],
			}),
		)

		// Accounts are created by a superuser from /_/. Nobody signs up on their own or promotes themselves.
		users.createRule = null
		users.updateRule = 'id = @request.auth.id && @request.body.role:isset = false'
		users.deleteRule = null

		app.save(users)
	},
	app => {
		const users = app.findCollectionByNameOrId('users')
		users.fields.removeById('usr_role')
		users.createRule = ''
		users.updateRule = 'id = @request.auth.id'
		users.deleteRule = 'id = @request.auth.id'
		app.save(users)
	},
)
