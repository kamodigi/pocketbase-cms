// Starts a throwaway PocketBase for the integration and E2E tests: the official binary at the
// version in compose.yaml, the example presets, the dev seed and the hooks in hooks/pb_hooks/, and
// a fresh data directory.
//
// With PBCMS_POCKETBASE=go, it is instead a PocketBase built with Go and the pbcms package
// (tests/gopocketbase/), and the JavaScript hooks that the package replaces are left out, so the
// same tests check both.
import { unzipSync } from 'fflate'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const root = path.resolve(import.meta.dirname, '..')

/**
The accounts created by dev/pb_migrations/.
*/
export const devAccounts = {
	editor: { email: 'editor@example.com', password: 'password1234' },
	superuser: { email: 'admin@example.com', password: 'password1234' },
} as const

const releasePlatforms = new Map<string, string>([
	['darwin', 'darwin'],
	['linux', 'linux'],
	['win32', 'windows'],
])
const releaseArchs = new Map<string, string>([
	['arm64', 'arm64'],
	['x64', 'amd64'],
])

/**
The JavaScript hooks that the Go package does in its place.
*/
const hooksInGo = new Set(['pbcms_schema.pb.js'])

const isGoBuild = process.env.PBCMS_POCKETBASE === 'go'

export interface PocketBaseServer {
	stop: () => Promise<void>
	url: string
}

export interface StartOptions {
	/**
	Extra environment variables for PocketBase, such as PBCMS_PUBLIC_URL.
	*/
	env?: Record<string, string>
	/**
	Extra files for pb_hooks, next to the ones in hooks/pb_hooks/. Keys are file names, values are source files.
	*/
	hooks?: Record<string, string>
	/**
	Defaults to a free port.
	*/
	port?: number
	/**
	Files to serve at /, like pb_public. Keys are paths inside it, values are source files or directories.
	*/
	public?: Record<string, string>
}

export async function startPocketBase(options: StartOptions = {}): Promise<PocketBaseServer> {
	const binary = isGoBuild ? await buildGoBinary() : await ensureBinary(await readVersion())
	const port = options.port ?? (await freePort())
	// A server left over from an earlier run would answer the health check in place of this one.
	if (options.port !== undefined && !(await isPortFree(port))) {
		throw new Error(`Port ${port} is already in use. Is another PocketBase still running?`)
	}
	const workDirectory = await mkdtemp(path.join(tmpdir(), 'pocketbase-cms-test-'))
	const migrationsDirectory = path.join(workDirectory, 'pb_migrations')
	const publicDirectory = path.join(workDirectory, 'pb_public')
	const hooksDirectory = path.join(workDirectory, 'pb_hooks')

	// Same as dev/entrypoint.sh: PocketBase reads migrations from one directory.
	await mkdir(migrationsDirectory)
	for (const source of ['examples/lantern-coffee/pb_migrations', 'dev/pb_migrations']) {
		await cp(path.join(root, source), migrationsDirectory, { recursive: true })
	}
	await cp(path.join(root, 'hooks/pb_hooks'), hooksDirectory, {
		filter: source => !isGoBuild || !hooksInGo.has(path.basename(source)),
		recursive: true,
	})
	const hookFiles = Object.entries(options.hooks ?? {})
	for (const [target, source] of hookFiles) {
		await cp(path.resolve(root, source), path.join(hooksDirectory, target))
	}
	await mkdir(publicDirectory)
	const publicFiles = Object.entries(options.public ?? {})
	for (const [target, source] of publicFiles) {
		await cp(path.resolve(root, source), path.join(publicDirectory, target), { recursive: true })
	}

	const url = `http://127.0.0.1:${port}`
	const child = spawn(
		binary,
		[
			'serve',
			`--http=127.0.0.1:${port}`,
			`--dir=${path.join(workDirectory, 'pb_data')}`,
			`--migrationsDir=${migrationsDirectory}`,
			`--publicDir=${publicDirectory}`,
			// Same as compose.yaml. Not watched: a restart mid-run would fail the tests in flight.
			`--hooksDir=${hooksDirectory}`,
			'--hooksWatch=false',
		],
		{ env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] },
	)
	let output = ''
	let spawnError: Error | undefined
	child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
	child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
	const exited = new Promise<void>(resolve => {
		child.once('exit', () => resolve())
		child.once('error', error => {
			spawnError = error
			resolve()
		})
	})
	const isRunning = () => child.exitCode === null && child.signalCode === null && !spawnError

	const stop = async () => {
		if (isRunning()) {
			child.kill()
			const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000)
			await exited
			clearTimeout(timeout)
		}
		await rm(workDirectory, { force: true, recursive: true })
	}

	try {
		await waitForHealth(url, isRunning)
	} catch (error) {
		await stop()
		const reason = spawnError?.message ?? (error as Error).message
		throw new Error(`PocketBase did not start: ${reason}\n${output}`, { cause: error })
	}
	return { stop, url }
}

/**
Built once per process. Go caches the build, so only the first run after a change takes long.
*/
const goBuild: { binary?: Promise<string> } = {}
async function buildGoBinary(): Promise<string> {
	goBuild.binary ??= (async () => {
		const name = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase'
		const binary = path.join(root, 'node_modules/.cache/pocketbase/go', name)
		// Other test processes may be starting the binary: build under a temporary name, then replace it.
		const partial = `${binary}.${process.pid}.partial`
		await promisify(execFile)('go', ['build', '-o', partial, './tests/gopocketbase'], {
			cwd: root,
			// PocketBase's SQLite driver is pure Go.
			env: { ...process.env, CGO_ENABLED: '0' },
		})
		await rename(partial, binary)
		return binary
	})()
	return goBuild.binary
}

/**
PocketBase's releases are at ganigeorgiev.com since v0.41. A file's URL holds the id of the release
record, so look it up by tag first, with the same filter as `pocketbase update`. The file is checked
against the release's checksums.txt.
*/
async function downloadRelease(version: string, file: string): Promise<Uint8Array> {
	const base = 'https://ganigeorgiev.com'
	const filter = `channel.repository.project.name="pocketbase" && channel.repository.name="pocketbase" && channel.name="default" && draft=false && tag="v${version}"`
	const query = new URLSearchParams({ fields: 'id', filter, perPage: '1', skipTotal: '1' })
	const release = await fetchOk(`${base}/api/collections/releases/records?${query}`)
	const { items } = (await release.json()) as { items: { id: string }[] }
	if (items.length === 0) throw new Error(`No PocketBase v${version} release at ${base}`)
	const files = `${base}/api/files/releases/${items[0].id}`

	const checksumsResponse = await fetchOk(`${files}/checksums.txt`)
	const checksums = await checksumsResponse.text()
	const expected = checksums
		.split('\n')
		.map(line => line.trim().split(/\s+/))
		.find(([, name]) => name === file)?.[0]
	if (!expected) throw new Error(`checksums.txt of PocketBase v${version} has no ${file}`)

	const fileResponse = await fetchOk(`${files}/${file}`)
	const content = new Uint8Array(await fileResponse.arrayBuffer())
	const actual = createHash('sha256').update(content).digest('hex')
	if (actual !== expected) throw new Error(`${file}: SHA-256 is ${actual}, checksums.txt says ${expected}`)
	return content
}

/**
The binary is cached per version and platform in node_modules/.cache, so it is downloaded once.
*/
async function ensureBinary(version: string): Promise<string> {
	const name = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase'
	const platform = releasePlatforms.get(process.platform)
	const arch = releaseArchs.get(process.arch)
	if (!platform || !arch) throw new Error(`No PocketBase release for ${process.platform}/${process.arch}`)

	const directory = path.join(root, 'node_modules/.cache/pocketbase', `${version}_${platform}_${arch}`)
	const binary = path.join(directory, name)
	if (existsSync(binary)) return binary

	const zip = await downloadRelease(version, `pocketbase_${version}_${platform}_${arch}.zip`)
	const files = unzipSync(zip, { filter: file => file.name === name })
	const content = files[name] as Uint8Array | undefined
	if (!content) throw new Error(`The PocketBase ${version} release has no ${name}`)

	await mkdir(directory, { recursive: true })
	// Write under a temporary name first, so an interrupted download never leaves a broken binary.
	const partial = `${binary}.${process.pid}.partial`
	await writeFile(partial, content)
	await chmod(partial, 0o755)
	await rename(partial, binary)
	return binary
}

async function fetchOk(url: string): Promise<Response> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Downloading ${url} failed: ${response.status}`)
	return response
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer()
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			server.close(() =>
				typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No port')),
			)
		})
	})
}

async function isPortFree(port: number): Promise<boolean> {
	return new Promise(resolve => {
		const server = createServer()
		server.once('error', () => resolve(false))
		server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
	})
}

/**
compose.yaml is the one place that names the PocketBase version.
*/
async function readVersion(): Promise<string> {
	const compose = await readFile(path.join(root, 'compose.yaml'), 'utf8')
	const version = /PB_VERSION:\s*([\d.]+)/.exec(compose)?.[1]
	if (!version) throw new Error('PB_VERSION not found in compose.yaml')
	return version
}

async function waitForHealth(url: string, isRunning: () => boolean): Promise<void> {
	const deadline = Date.now() + 30_000
	while (Date.now() < deadline) {
		if (!isRunning()) throw new Error('the process exited')
		try {
			const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) })
			if (response.ok) return
		} catch {
			// Not listening yet.
		}
		await new Promise(resolve => setTimeout(resolve, 100))
	}
	throw new Error('timed out waiting for /api/health')
}
