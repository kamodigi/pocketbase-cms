// @vitest-environment node
import { unzipSync } from 'fflate'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const run = promisify(execFile)

describe('release/package.sh', () => {
	let work: string
	let build: string
	let out: string
	const pack = (tag: string) => run(path.join(root, 'release/package.sh'), [tag, build, out])

	beforeEach(async () => {
		work = await mkdtemp(path.join(tmpdir(), 'pocketbase-cms-release-'))
		build = path.join(work, 'build')
		out = path.join(work, 'out')
		await mkdir(path.join(build, '_app'), { recursive: true })
		await writeFile(path.join(build, 'index.html'), '<!doctype html>')
		await writeFile(path.join(build, '_app/start.js'), 'export {}')
	})
	afterEach(() => rm(work, { force: true, recursive: true }))

	const entries = async () => {
		const files = unzipSync(await readFile(path.join(out, 'pocketbase-cms_0.1.0.zip')))
		return Object.keys(files)
			.filter(name => !name.endsWith('/'))
			.toSorted((a, b) => a.localeCompare(b))
	}

	it('zips the build as cms/, the hooks as pb_hooks/ and the license', async () => {
		await pack('v0.1.0')

		const hooks = path.join(root, 'hooks/pb_hooks')
		const hookEntries = await readdir(hooks, { recursive: true, withFileTypes: true })
		const hookFiles = hookEntries
			.filter(entry => entry.isFile())
			.map(entry => `pb_hooks/${path.relative(hooks, path.join(entry.parentPath, entry.name))}`)
		expect(hookFiles).toContain('pb_hooks/pbcms/html.cjs')
		expect(await entries()).toEqual(
			['LICENSE', 'cms/_app/start.js', 'cms/index.html', ...hookFiles].toSorted((a, b) => a.localeCompare(b)),
		)
	})

	it('starts over when the zip already exists', async () => {
		await pack('v0.1.0')
		await rm(path.join(build, '_app/start.js'))
		await pack('v0.1.0')

		expect(await entries()).not.toContain('cms/_app/start.js')
	})

	it.each(['v0.0.0', 'v1.2.30', 'v0.1.0-rc.1', 'v0.0.0-dev'])('accepts the tag %s', async tag => {
		await expect(pack(tag)).resolves.toBeDefined()
	})

	it.each(['0.1.0', 'v0.1', 'v01.0.0', 'v0.1.0+build', 'v0.1.0-', 'v0.1.0-rc..1', 'v2.0.0', 'v0.1.0/../x'])(
		'refuses the tag %s',
		async tag => {
			await expect(pack(tag)).rejects.toThrow('Not a release tag')
		},
	)

	it('refuses to pack without a build', async () => {
		await rm(path.join(build, 'index.html'))

		await expect(pack('v0.1.0')).rejects.toThrow('pnpm build')
	})
})
