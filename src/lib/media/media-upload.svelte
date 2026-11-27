<script lang="ts">
	import type { RecordModel } from 'pocketbase'

	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { ClientResponseError } from 'pocketbase'
	import { onDestroy } from 'svelte'

	import { signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	import { prepareFile } from './compress'
	import { acceptOf, fileError } from './files'
	import { type MediaLibrary, mediaMetadata } from './library'

	interface Props {
		library: MediaLibrary
		/**
		Called with the new media record.
		*/
		onuploaded: (record: RecordModel) => void
		uiLocale: string
	}

	let { library, onuploaded, uiLocale }: Props = $props()

	const id = $props.id()
	let file = $state<File>()
	let preview = $state<string>()
	let alt = $state('')
	let caption = $state('')
	let fileProblem = $state('')
	let altProblem = $state('')
	let failure = $state('')
	let isPreparing = $state(false)
	let isUploading = $state(false)
	let input = $state<HTMLInputElement>()
	// eslint-disable-next-line unicorn/no-null -- the empty value of the input's `ref`
	let altInput = $state<HTMLInputElement | null>(null)

	onDestroy(() => {
		if (preview) URL.revokeObjectURL(preview)
	})

	async function chosen(event: Event & { currentTarget: HTMLInputElement }) {
		const picked = event.currentTarget.files?.[0]
		event.currentTarget.value = ''
		if (!picked) return
		isPreparing = true
		const prepared = await prepareFile(picked, library.compress, { accepted: library.file.mimeTypes ?? [] })
		isPreparing = false
		const isImage = prepared.size !== undefined
		fileProblem = isImage
			? (fileError(prepared.file, library.file, uiLocale) ?? '')
			: m.media_error_not_image({ name: picked.name })
		if (fileProblem !== '') return
		if (preview) URL.revokeObjectURL(preview)
		file = prepared.file
		preview = URL.createObjectURL(prepared.file)
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault()
		// The record form around the dialog must not take this submit as its own.
		event.stopPropagation()
		if (isUploading) return
		failure = ''
		if (!file) fileProblem = m.media_error_no_file()
		altProblem = library.altField && alt.trim() === '' ? m.form_error_required() : ''
		if (!file || altProblem !== '') {
			if (altProblem !== '') altInput?.focus()
			return
		}

		const data: Record<string, unknown> = { [library.fields.file]: file, ...mediaMetadata(library.fields, file) }
		if (library.altField) data[library.altField] = alt.trim()
		if (library.captionField && caption.trim() !== '') data[library.captionField] = caption.trim()
		for (const { kind, name } of library.autofill) {
			if (kind === 'now') data[name] = new Date().toISOString().replace('T', ' ')
			else if (pb.authStore.record) data[name] = pb.authStore.record.id
		}

		isUploading = true
		let record: RecordModel
		try {
			record = await pb.collection(library.collection).create(data)
		} catch (error) {
			isUploading = false
			if (!(error instanceof ClientResponseError)) throw error
			if (error.status === 401) {
				signOut(pb)
				void goto(resolve('/(auth)/login'))
				return
			}
			failure = m.media_upload_error({ message: error.message })
			return
		}
		isUploading = false
		if (preview) URL.revokeObjectURL(preview)
		file = undefined
		preview = undefined
		alt = ''
		caption = ''
		onuploaded(record)
	}
</script>

<form class="grid gap-3 rounded-lg border p-3" aria-labelledby="{id}-heading" novalidate onsubmit={submit}>
	<h3 class="text-sm font-medium" id="{id}-heading">{m.media_upload_heading()}</h3>
	<div class="flex flex-wrap items-center gap-3">
		{#if preview}
			<img class="bg-muted size-16 rounded-md object-cover" alt="" src={preview} />
		{/if}
		<input
			bind:this={input}
			class="sr-only"
			accept={acceptOf(library.file, true)}
			aria-hidden="true"
			onchange={chosen}
			tabindex="-1"
			type="file"
		/>
		<Button
			aria-describedby={fileProblem ? `${id}-file-error` : undefined}
			aria-invalid={fileProblem ? 'true' : undefined}
			disabled={isPreparing || isUploading}
			onclick={() => input?.click()}
			size="sm"
			variant="outline"
		>
			{file ? m.media_upload_replace() : m.media_upload_choose()}
		</Button>
		{#if file}
			<span class="min-w-0 text-sm break-all">{file.name}</span>
		{/if}
	</div>
	{#if isPreparing}
		<p class="text-muted-foreground text-sm" role="status">{m.file_preparing()}</p>
	{/if}
	{#if fileProblem}
		<p class="text-destructive text-sm" id="{id}-file-error" role="alert">{fileProblem}</p>
	{/if}

	{#if library.altField}
		<div class="grid gap-1.5">
			<Label for="{id}-alt">
				{m.media_alt()}
				<span class="text-muted-foreground text-xs font-normal">{m.form_required()}</span>
			</Label>
			<Input
				id="{id}-alt"
				aria-describedby="{id}-alt-help{altProblem ? ` ${id}-alt-error` : ''}"
				aria-invalid={altProblem ? 'true' : undefined}
				aria-required="true"
				autocomplete="off"
				bind:ref={altInput}
				bind:value={alt}
			/>
			<p class="text-muted-foreground text-sm" id="{id}-alt-help">{m.media_alt_help()}</p>
			{#if altProblem}
				<p class="text-destructive text-sm" id="{id}-alt-error">{altProblem}</p>
			{/if}
		</div>
	{/if}
	{#if library.captionField}
		<div class="grid gap-1.5">
			<Label for="{id}-caption">{m.media_caption()}</Label>
			<Input id="{id}-caption" autocomplete="off" bind:value={caption} />
		</div>
	{/if}

	{#if failure}
		<p class="text-destructive text-sm" role="alert">{failure}</p>
	{/if}
	<Button class="justify-self-start" disabled={isPreparing || isUploading} size="sm" type="submit">
		{isUploading ? m.media_uploading() : m.media_upload_submit()}
	</Button>
</form>
