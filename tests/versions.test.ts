// @vitest-environment node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const read = (file: string) => readFile(path.join(root, file), 'utf8')

// compose.yaml names the official binary the tests and the development PocketBase run; go.mod names
// the PocketBase the Go package is built against. Both must be the same release.
describe('the PocketBase version', () => {
	it('is the same in compose.yaml, go.mod and the READMEs', async () => {
		const version = /PB_VERSION:\s*([\d.]+)/.exec(await read('compose.yaml'))?.[1]
		expect(version).toMatch(/^\d+\.\d+\.\d+$/)

		// A single `require` line, or a line in a `require ( … )` block.
		const goModule = /^(?:require )?\s*ganigeorgiev\.com\/pocketbase\/pocketbase v(\S+)$/m.exec(
			await read('go.mod'),
		)?.[1]
		expect(goModule).toBe(version)

		for (const readme of ['README.md', 'README.ja.md']) {
			expect(await read(readme), readme).toContain(`v${version}`)
		}
	})
})
