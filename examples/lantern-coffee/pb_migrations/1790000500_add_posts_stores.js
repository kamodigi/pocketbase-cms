/// <reference path="../pb_data/types.d.ts" />
// A post can name the stores it is about: a relation that holds several records.
migrate(
	app => {
		const collection = app.findCollectionByNameOrId('col_posts')
		collection.fields.add(
			new RelationField({ id: 'ps_stores', name: 'stores', collectionId: 'col_stores', maxSelect: 5 }),
		)
		app.save(collection)
	},
	app => {
		const collection = app.findCollectionByNameOrId('col_posts')
		collection.fields.removeById('ps_stores')
		app.save(collection)
	},
)
