/// <reference path="../pb_data/types.d.ts" />
// List type: a flat list of similar records, with no publish state.
migrate(
	app => {
		const editor = '@request.auth.role = "editor"'

		const collection = new Collection({
			id: 'col_stores',
			name: 'stores',
			type: 'base',
			listRule: '',
			viewRule: '',
			createRule: editor,
			updateRule: editor,
			deleteRule: editor,
			fields: [
				{ id: 'st_name', name: 'name', type: 'text', required: true, min: 1, max: 255 },
				{
					id: 'st_region',
					name: 'region',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['north', 'south', 'east', 'west'],
				},
				{ id: 'st_address', name: 'address', type: 'text' },
				{ id: 'st_url', name: 'url', type: 'url' },
				{ id: 'st_created', name: 'created', type: 'autodate', onCreate: true },
				{ id: 'st_updated', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
		})

		app.save(collection)
	},
	app => {
		app.delete(app.findCollectionByNameOrId('col_stores'))
	},
)
