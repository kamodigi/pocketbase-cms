import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type PocketBaseServer, startPocketBase } from '../pocketbase'
import { asEditor, asSuperuser, mediaForm, uniqueId } from './clients'

// The body says null, not undefined, for a record that does not exist on one side of a change.
/* eslint-disable unicorn/no-null */

interface Notification {
	body: {
		action: string
		collection: string
		new: null | Record<string, unknown>
		old: null | Record<string, unknown>
	}
	headers: IncomingHttpHeaders
	method: string
}

/**
Stands in for the site: records every request, and answers with `status`.
*/
async function startReceiver() {
	const received: Notification[] = []
	// With `silent`, requests are recorded but never answered.
	const receiver = { received, silent: false, status: 204 }
	const server: Server = createServer((request, response) => {
		let body = ''
		request.setEncoding('utf8')
		request.on('data', (chunk: string) => (body += chunk))
		request.on('end', () => {
			received.push({ body: JSON.parse(body), headers: request.headers, method: request.method! })
			if (!receiver.silent) response.writeHead(receiver.status).end()
		})
	})
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = server.address() as { port: number }
	return Object.assign(receiver, {
		/**
		The notifications about one record, in the order they arrived.
		*/
		about: (id: string) => received.filter(({ body }) => (body.new ?? body.old)!.id === id),
		close: () =>
			new Promise<void>(resolve => {
				server.close(() => resolve())
				server.closeAllConnections()
			}),
		url: `http://127.0.0.1:${address.port}/api/revalidate`,
	})
}

const secret = 'test-notify-secret'
const config = { 'cms/config.json': 'examples/lantern-coffee/cms.config.json' }

/**
Waits for PocketBase to write a log entry about the record; it writes logs in batches.
*/
async function failureLogFor(url: string, recordId: string) {
	const admin = await asSuperuser(url)
	return vi.waitFor(
		async () => {
			const { items } = await admin.logs.getList(1, 1, {
				filter: admin.filter('message = {:message} && data.record = {:recordId}', {
					message: 'pbcms: could not notify the site',
					recordId,
				}),
			})
			expect(items).toHaveLength(1)
			return items[0]
		},
		{ interval: 250, timeout: 10_000 },
	)
}

// hooks/pb_hooks/pbcms_notify.pb.js. PocketBase sends a notification before it answers the request
// that made the change, so the receiver has it as soon as the call returns.
describe('notifications to the site', () => {
	describe('with PBCMS_NOTIFY_URL and PBCMS_NOTIFY_SECRET', () => {
		let receiver: Awaited<ReturnType<typeof startReceiver>>
		let server: PocketBaseServer

		beforeAll(async () => {
			receiver = await startReceiver()
			server = await startPocketBase({
				env: { PBCMS_NOTIFY_SECRET: secret, PBCMS_NOTIFY_URL: receiver.url },
				hooks: { 'notify-app-save.pb.js': 'tests/integration/fixtures/notify-app-save.pb.js' },
				public: config,
			})
		})
		afterAll(async () => {
			await server?.stop()
			await receiver?.close()
		})

		it('POSTs the collection and the record before and after a create, an update and a delete', async () => {
			const editor = await asEditor(server.url)
			const slug = uniqueId()
			const { id } = await editor.collection('posts').create({ draft: true, slug, title: 'Draft' })
			const renamed = `${slug}-renamed`
			const response = await editor.collection('posts').update(id, { draft: false, slug: renamed, title: 'Published' })
			// What the hook keeps on the record between capture and delivery stays out of API responses.
			expect(Object.keys(response).filter(key => key.startsWith('pbcms'))).toEqual([])
			await editor.collection('posts').delete(id)

			const [created, updated, deleted, ...rest] = receiver.about(id)
			expect(rest).toEqual([])
			for (const { headers, method } of [created, updated, deleted]) {
				expect(method).toBe('POST')
				expect(headers['content-type']).toBe('application/json')
				expect(headers['x-pbcms-secret']).toBe(secret)
			}

			const draft = { draft: true, id, slug, title: 'Draft' }
			const published = { draft: false, id, slug: renamed, title: 'Published' }
			expect(created.body).toMatchObject({ action: 'create', collection: 'posts', new: draft, old: null })
			expect(updated.body).toMatchObject({ action: 'update', collection: 'posts', new: published, old: draft })
			expect(deleted.body).toMatchObject({ action: 'delete', collection: 'posts', new: null, old: published })
		})

		it('covers the media collection, and records that a change touches indirectly', async () => {
			const editor = await asEditor(server.url)
			const media = await editor.collection('media').create(mediaForm('A cup'))
			const post = await editor.collection('posts').create({ cover: media.id, slug: uniqueId(), title: 'Cover' })
			// PocketBase empties the relation of the post as part of this delete.
			await editor.collection('media').delete(media.id)

			expect(receiver.about(media.id).map(({ body }) => [body.collection, body.action])).toEqual([
				['media', 'create'],
				['media', 'delete'],
			])
			expect(receiver.about(post.id).at(-1)!.body).toMatchObject({
				action: 'update',
				new: { cover: '' },
				old: { cover: media.id },
			})
		})

		it('reports each save made by a hook, after its transaction commits, and nothing rolled back', async () => {
			const admin = await asSuperuser(server.url)
			const { id } = await admin.send<{ id: string }>(`/test/notify/${uniqueId()}`, { method: 'POST' })

			const titles = receiver.about(id).map(({ body }) => [body.action, body.old?.title, body.new?.title])
			expect(titles).toEqual([
				['create', undefined, 'first'],
				['update', 'first', 'second'],
				['update', 'second', 'third'],
				['update', 'third', 'fourth'],
				['update', 'fourth', 'fifth'],
				['delete', 'fifth', undefined],
			])
		})

		it('says nothing about collections the CMS does not manage', async () => {
			const admin = await asSuperuser(server.url)
			const email = `${uniqueId()}@example.com`
			const user = await admin
				.collection('users')
				.create({ email, password: 'password1234', passwordConfirm: 'password1234' })
			await admin.collection('users').update(user.id, { name: 'Renamed' })
			await admin.collection('users').delete(user.id)

			expect(receiver.about(user.id)).toEqual([])
		})

		it('does not send a request for a refused save', async () => {
			const editor = await asEditor(server.url)
			const before = receiver.received.length
			await expect(editor.collection('posts').create({ title: '' })).rejects.toMatchObject({ status: 400 })
			expect(receiver.received).toHaveLength(before)
		})

		it('keeps the save, and logs the failure, when the site answers an error', async () => {
			const editor = await asEditor(server.url)
			receiver.status = 500
			try {
				const { id } = await editor.collection('posts').create({ slug: uniqueId(), title: 'Unheard' })
				await expect(editor.collection('posts').getOne(id)).resolves.toMatchObject({ title: 'Unheard' })
				const log = await failureLogFor(server.url, id)
				expect(log.data).toMatchObject({ action: 'create', collection: 'posts' })
				expect(log.data.error).toContain('500')
				expect(JSON.stringify(log)).not.toContain(secret)
			} finally {
				receiver.status = 204
			}
		}, 20_000)

		it('gives up on a site that does not answer after 10 seconds, and keeps the save', async () => {
			const editor = await asEditor(server.url)
			receiver.silent = true
			try {
				const started = Date.now()
				const { id } = await editor.collection('posts').create({ slug: uniqueId(), title: 'Waiting' })
				expect(Date.now() - started).toBeGreaterThanOrEqual(9000)
				await expect(editor.collection('posts').getOne(id)).resolves.toMatchObject({ title: 'Waiting' })
				await failureLogFor(server.url, id)
			} finally {
				receiver.silent = false
			}
		}, 30_000)
	})

	describe('with hidden fields in a managed auth collection', () => {
		let receiver: Awaited<ReturnType<typeof startReceiver>>
		let server: PocketBaseServer

		beforeAll(async () => {
			receiver = await startReceiver()
			server = await startPocketBase({
				env: {
					PBCMS_CONFIG_PATH: 'tests/integration/fixtures/schema-config.json',
					PBCMS_NOTIFY_SECRET: secret,
					PBCMS_NOTIFY_URL: receiver.url,
				},
			})
		})
		afterAll(async () => {
			await server?.stop()
			await receiver?.close()
		})

		it('leaves out the password, the token key and a private email', async () => {
			const admin = await asSuperuser(server.url)
			const email = `${uniqueId()}@example.com`
			const { id } = await admin
				.collection('users')
				.create({ email, password: 'password1234', passwordConfirm: 'password1234' })
			await admin.collection('users').update(id, { name: 'Renamed' })

			const { body } = receiver.about(id)[1]
			for (const record of [body.old!, body.new!]) {
				expect(record).not.toHaveProperty('password')
				expect(record).not.toHaveProperty('tokenKey')
				expect(record).not.toHaveProperty('email')
			}
			expect(body.new).toMatchObject({ name: 'Renamed' })
		})
	})

	describe.each([
		{ env: { PBCMS_NOTIFY_SECRET: secret } as Record<string, string>, name: 'without PBCMS_NOTIFY_URL' },
		{ env: {}, name: 'without either variable' },
	])('$name', ({ env }) => {
		let server: PocketBaseServer

		beforeAll(async () => {
			server = await startPocketBase({ env, public: config })
		})
		afterAll(() => server?.stop())

		it('saves records and logs nothing', async () => {
			const editor = await asEditor(server.url)
			const { id } = await editor.collection('posts').create({ slug: uniqueId(), title: 'Quiet' })
			await editor.collection('posts').update(id, { title: 'Still quiet' })
			await editor.collection('posts').delete(id)

			const admin = await asSuperuser(server.url)
			// The request of the delete is logged in the same batch as, or after, anything the hooks logged.
			await vi.waitFor(
				async () => {
					const { items } = await admin.logs.getList(1, 1, { filter: `message ~ "DELETE %${id}"` })
					expect(items).toHaveLength(1)
				},
				{ interval: 250, timeout: 10_000 },
			)
			const { totalItems } = await admin.logs.getList(1, 1, { filter: 'message ~ "pbcms:"' })
			expect(totalItems).toBe(0)
		}, 20_000)
	})

	describe.each([
		{
			env: { PBCMS_NOTIFY_URL: 'receiver' } as Record<string, string>,
			name: 'without PBCMS_NOTIFY_SECRET',
			public: config,
			reason: 'PBCMS_NOTIFY_SECRET',
		},
		{
			env: { PBCMS_NOTIFY_SECRET: secret, PBCMS_NOTIFY_URL: 'receiver' },
			name: 'without a readable CMS config',
			public: {},
			reason: 'The CMS config could not be read',
		},
		{
			env: { PBCMS_NOTIFY_SECRET: secret, PBCMS_NOTIFY_URL: 'http://127.0.0.1:1/closed' },
			name: 'when nothing listens at the URL',
			public: config,
			reason: '127.0.0.1:1',
		},
	])('$name', options => {
		let receiver: Awaited<ReturnType<typeof startReceiver>>
		let server: PocketBaseServer

		beforeAll(async () => {
			receiver = await startReceiver()
			const env: Record<string, string> = { ...options.env }
			if (env.PBCMS_NOTIFY_URL === 'receiver') env.PBCMS_NOTIFY_URL = receiver.url
			server = await startPocketBase({ env, public: options.public })
		})
		afterAll(async () => {
			await server?.stop()
			await receiver?.close()
		})

		it('keeps the save, sends nothing, and logs why', async () => {
			const editor = await asEditor(server.url)
			const { id } = await editor.collection('posts').create({ slug: uniqueId(), title: 'Saved' })
			await expect(editor.collection('posts').getOne(id)).resolves.toMatchObject({ title: 'Saved' })

			const log = await failureLogFor(server.url, id)
			expect(log.data.error).toContain(options.reason)
			expect(receiver.received).toEqual([])
		}, 20_000)
	})
})
