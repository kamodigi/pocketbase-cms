/// <reference path="../pb_data/types.d.ts" />
// Multilingual article type: the title and body are written per content locale (`locales` in
// cms.config.json), as `<name>_<locale>` fields. The slug, cover, dates and publish state are shared.
// A locale with a hyphen becomes lower case with an underscore: zh-Hans → title_zh_hans.
migrate(
	app => {
		const published = '(draft = false && (published_at = "" || published_at <= @now))'
		const editor = '@request.auth.role = "editor"'

		const collection = new Collection({
			id: 'col_events',
			name: 'events',
			type: 'base',
			// The public sees published events only. Editors see everything.
			listRule: `${published} || ${editor}`,
			viewRule: `${published} || ${editor}`,
			createRule: editor,
			updateRule: editor,
			deleteRule: editor,
			fields: [
				// Only the base locale is required; a missing translation does not block saving.
				{ id: 'ev_title_en', name: 'title_en', type: 'text', required: true, min: 1, max: 255 },
				{ id: 'ev_title_ja', name: 'title_ja', type: 'text', max: 255 },
				{ id: 'ev_title_zh_hans', name: 'title_zh_hans', type: 'text', max: 255 },
				{ id: 'ev_slug', name: 'slug', type: 'text', required: true, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
				{ id: 'ev_body_en', name: 'body_en', type: 'editor', convertURLs: false },
				{ id: 'ev_body_ja', name: 'body_ja', type: 'editor', convertURLs: false },
				{ id: 'ev_body_zh_hans', name: 'body_zh_hans', type: 'editor', convertURLs: false },
				{ id: 'ev_cover', name: 'cover', type: 'relation', collectionId: 'col_media', maxSelect: 1 },
				{ id: 'ev_startsAt', name: 'starts_at', type: 'date' },
				{ id: 'ev_draft', name: 'draft', type: 'bool' },
				{ id: 'ev_publishedAt', name: 'published_at', type: 'date' },
				{ id: 'ev_created', name: 'created', type: 'autodate', onCreate: true },
				{ id: 'ev_updated', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: [
				'CREATE UNIQUE INDEX `idx_events_slug` ON `events` (`slug`)',
				'CREATE INDEX `idx_events_starts_at` ON `events` (`starts_at`)',
			],
		})

		app.save(collection)
	},
	app => {
		app.delete(app.findCollectionByNameOrId('col_events'))
	},
)
