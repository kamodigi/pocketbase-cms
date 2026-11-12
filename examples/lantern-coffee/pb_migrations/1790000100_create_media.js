/// <reference path="../pb_data/types.d.ts" />
// Media library: the recommended preset for images shared by every collection.
migrate(
	app => {
		const users = app.findCollectionByNameOrId('users')

		const collection = new Collection({
			id: 'col_media',
			name: 'media',
			type: 'base',
			// Anyone can read, only editors can write.
			listRule: '',
			viewRule: '',
			createRule: '@request.auth.role = "editor"',
			updateRule: '@request.auth.role = "editor"',
			deleteRule: '@request.auth.role = "editor"',
			fields: [
				{
					id: 'md_file',
					name: 'file',
					type: 'file',
					required: true,
					maxSelect: 1,
					maxSize: 10485760,
					mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
					thumbs: ['160x160f', '480x0', '960x0'],
				},
				{ id: 'md_alt', name: 'alt', type: 'text', required: true, max: 255 },
				{ id: 'md_caption', name: 'caption', type: 'text' },
				{ id: 'md_width', name: 'width', type: 'number', min: 0, onlyInt: true },
				{ id: 'md_height', name: 'height', type: 'number', min: 0, onlyInt: true },
				{ id: 'md_mime', name: 'mime', type: 'text', max: 127 },
				{ id: 'md_uploadedBy', name: 'uploadedBy', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ id: 'md_created', name: 'created', type: 'autodate', onCreate: true },
				{ id: 'md_updated', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
		})

		app.save(collection)
	},
	app => {
		app.delete(app.findCollectionByNameOrId('col_media'))
	},
)
