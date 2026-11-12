/// <reference path="../pb_data/types.d.ts" />
// Article type: a title, a slug, a rich text body, a cover image and a publish state.
migrate(
	app => {
		const published = '(draft = false && (published_at = "" || published_at <= @now))'
		const editor = '@request.auth.role = "editor"'

		const collection = new Collection({
			id: 'col_posts',
			name: 'posts',
			type: 'base',
			// The public sees published posts only. Editors see everything.
			listRule: `${published} || ${editor}`,
			viewRule: `${published} || ${editor}`,
			createRule: editor,
			updateRule: editor,
			deleteRule: editor,
			fields: [
				{ id: 'ps_title', name: 'title', type: 'text', required: true, min: 1, max: 255 },
				{ id: 'ps_slug', name: 'slug', type: 'text', required: true, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
				{ id: 'ps_body', name: 'body', type: 'editor', convertURLs: false },
				{ id: 'ps_cover', name: 'cover', type: 'relation', collectionId: 'col_media', maxSelect: 1 },
				{ id: 'ps_category', name: 'category', type: 'select', maxSelect: 1, values: ['news', 'event', 'journal'] },
				{ id: 'ps_pinned', name: 'pinned', type: 'bool' },
				{ id: 'ps_draft', name: 'draft', type: 'bool' },
				{ id: 'ps_publishedAt', name: 'published_at', type: 'date' },
				{ id: 'ps_created', name: 'created', type: 'autodate', onCreate: true },
				{ id: 'ps_updated', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: [
				'CREATE UNIQUE INDEX `idx_posts_slug` ON `posts` (`slug`)',
				'CREATE INDEX `idx_posts_published_at` ON `posts` (`published_at`)',
			],
		})

		app.save(collection)
	},
	app => {
		app.delete(app.findCollectionByNameOrId('col_posts'))
	},
)
