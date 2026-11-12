/// <reference path="../pb_data/types.d.ts" />
// Single page type: a collection that holds exactly one record. The record is created here,
// so editors can only edit it. They cannot create or delete it.
migrate(
	app => {
		const editor = '@request.auth.role = "editor"'

		const collection = new Collection({
			id: 'col_about',
			name: 'about',
			type: 'base',
			listRule: '',
			viewRule: '',
			createRule: null,
			updateRule: editor,
			deleteRule: null,
			fields: [
				{ id: 'ab_title', name: 'title', type: 'text', required: true, min: 1, max: 255 },
				{ id: 'ab_body', name: 'body', type: 'editor', convertURLs: false },
				{ id: 'ab_image', name: 'image', type: 'relation', collectionId: 'col_media', maxSelect: 1 },
				{ id: 'ab_created', name: 'created', type: 'autodate', onCreate: true },
				{ id: 'ab_updated', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
		})

		app.save(collection)

		const record = new Record(collection)
		record.set('title', 'About Lantern Coffee')
		record.set('body', '<p>Lantern Coffee is a fictional coffee roaster used in the pocketbase-cms examples.</p>')
		app.save(record)
	},
	app => {
		app.delete(app.findCollectionByNameOrId('col_about'))
	},
)
