<script lang="ts">
	import type { RecordModel } from 'pocketbase'

	import FileIcon from '@lucide/svelte/icons/file'
	import XIcon from '@lucide/svelte/icons/x'
	import { onDestroy, onMount, tick, untrack } from 'svelte'
	import { SvelteMap } from 'svelte/reactivity'

	import type { FormField } from '#lib/form/model.js'
	import type { FileValue, FormValue } from '#lib/form/values.js'

	import { Button } from '#lib/components/ui/button/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	import { defaultCompress, prepareFile } from './compress'
	import { acceptOf, fileError, formatBytes, isImageName } from './files'

	interface Props {
		describedBy?: string
		/**
		A `file` or `files` field.
		*/
		field: FormField
		invalid?: 'true'
		/**
		Called with the files the field now holds.
		*/
		onchange: (value: FileValue) => void
		/**
		The saved record, whose stored files are shown; undefined on the screen that creates one.
		*/
		record?: RecordModel
		uiLocale: string
		value: FormValue
	}

	let { describedBy, field, invalid, onchange, record, uiLocale, value }: Props = $props()

	const isMultiple = untrack(() => field.kind === 'files')
	const max = untrack(() => (isMultiple ? (field.field.maxSelect ?? 1) : 1))
	const accepted = untrack(() => field.field.mimeTypes ?? [])
	const files = $derived<FileValue>(Array.isArray(value) ? value : [])
	// Previews of the new files, until they are saved or removed.
	const previews = new SvelteMap<File, string>()
	let token = $state<string>()
	let problems = $state<string[]>([])
	let isPreparing = $state(false)
	let input = $state<HTMLInputElement>()
	// eslint-disable-next-line unicorn/no-null -- the empty value of the button's `ref`
	let chooseButton = $state<HTMLElement | null>(null)

	onMount(() => {
		// Protected files are read with a short-lived token.
		if (field.field.protected) void pb.files.getToken().then(next => (token = next))
	})

	onDestroy(() => {
		for (const url of previews.values()) URL.revokeObjectURL(url)
	})

	// A saved record gives names in place of the new files.
	$effect(() => {
		const current = new Set(files)
		untrack(() => {
			for (const [file, url] of previews) {
				if (current.has(file)) continue
				URL.revokeObjectURL(url)
				previews.delete(file)
			}
		})
	})

	async function chosen(event: Event & { currentTarget: HTMLInputElement }) {
		const picked = [...(event.currentTarget.files ?? [])]
		// The same file can be picked again after it was removed.
		event.currentTarget.value = ''
		if (picked.length === 0) return

		const errors: string[] = []
		const room = isMultiple ? Math.max(0, max - files.length) : 1
		if (picked.length > room) errors.push(m.form_error_max_files({ max }))
		isPreparing = true
		const added: File[] = []
		for (const file of picked.slice(0, room)) {
			const { file: prepared } = await prepareFile(file, field.compress ?? defaultCompress, { accepted })
			const error = fileError(prepared, field.field, uiLocale)
			if (error) errors.push(error)
			else added.push(prepared)
		}
		isPreparing = false
		problems = errors
		if (added.length === 0) return
		for (const file of added) if (file.type.startsWith('image/')) previews.set(file, URL.createObjectURL(file))
		onchange(isMultiple ? [...files, ...added] : added.slice(-1))
	}

	/**
	Whether the stored files can be shown: the record is saved, and a protected file has its token.
	*/
	function isReadable(): boolean {
		return record !== undefined && (token !== undefined || !field.field.protected)
	}

	function nameOf(file: File | string): string {
		return typeof file === 'string' ? file : file.name
	}

	async function remove(file: File | string) {
		problems = []
		onchange(files.filter(item => item !== file))
		// The button that had the focus is gone.
		await tick()
		chooseButton?.focus()
	}

	function storedUrl(name: string): string | undefined {
		return isReadable() ? pb.files.getURL(record!, name, { token }) : undefined
	}

	function thumbnail(file: File | string): string | undefined {
		if (typeof file !== 'string') return previews.get(file)
		return isReadable() && isImageName(file) ? pb.files.getURL(record!, file, { thumb: '100x100', token }) : undefined
	}
</script>

{#if files.length > 0}
	<ul class="grid gap-2" aria-live="polite">
		{#each files as file (file)}
			{@const name = nameOf(file)}
			{@const thumb = thumbnail(file)}
			<li class="bg-card flex items-center gap-3 rounded-lg border p-1.5 text-sm">
				{#if thumb}
					<img class="bg-muted size-14 shrink-0 rounded-md object-cover" alt="" src={thumb} />
				{:else}
					<span class="bg-muted text-muted-foreground grid size-14 shrink-0 place-items-center rounded-md">
						<FileIcon class="size-5" />
					</span>
				{/if}
				<span class="grid min-w-0 flex-1 gap-0.5">
					{#if typeof file === 'string' && storedUrl(file)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- a file on PocketBase -->
						<a
							class="text-link break-all underline underline-offset-2"
							href={storedUrl(file)}
							rel="noopener"
							target="_blank"
						>
							{name}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else}
						<span class="break-all">{name}</span>
					{/if}
					{#if typeof file !== 'string'}
						<span class="text-muted-foreground text-xs">
							{m.file_not_saved({ size: formatBytes(file.size, uiLocale) })}
						</span>
					{/if}
				</span>
				{#if !field.readonly}
					<Button aria-label={m.relation_remove({ name })} onclick={() => remove(file)} size="icon-sm" variant="ghost">
						<XIcon />
					</Button>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="text-muted-foreground text-sm">{m.file_none()}</p>
{/if}

{#if isPreparing}
	<p class="text-muted-foreground text-sm" role="status">{m.file_preparing()}</p>
{/if}
{#each problems as problem (problem)}
	<p class="text-destructive text-sm" role="alert">{problem}</p>
{/each}

{#if !field.readonly}
	<input
		bind:this={input}
		class="sr-only"
		accept={acceptOf(field.field)}
		aria-hidden="true"
		multiple={isMultiple}
		onchange={chosen}
		tabindex="-1"
		type="file"
	/>
	<Button
		class="justify-self-start"
		aria-describedby={describedBy}
		aria-invalid={invalid}
		disabled={isPreparing || (isMultiple && files.length >= max)}
		onclick={() => input?.click()}
		variant="outline"
		bind:ref={chooseButton}
	>
		{isMultiple
			? m.file_add({ field: field.label })
			: files.length > 0
				? m.file_replace({ field: field.label })
				: m.file_choose({ field: field.label })}
	</Button>
{/if}
