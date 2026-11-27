<script lang="ts">
	import type { RecordModel } from 'pocketbase'

	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import ImageIcon from '@lucide/svelte/icons/image'
	import XIcon from '@lucide/svelte/icons/x'
	import { ClientResponseError } from 'pocketbase'
	import { onMount, tick, untrack } from 'svelte'
	import { SvelteMap, SvelteSet } from 'svelte/reactivity'

	import type { FormField } from '#lib/form/model.js'
	import type { FormValue } from '#lib/form/values.js'

	import { signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { fetchChosen } from '#lib/relation/records.js'
	import { m } from '#paraglide/messages.js'

	import { mediaFileName, pickerThumb } from './library'
	import MediaPicker from './media-picker.svelte'

	interface Props {
		describedBy?: string
		/**
		A `relation` or `relations` field whose target is the media library.
		*/
		field: FormField
		invalid?: 'true'
		/**
		Called with the new value: an id or "" for one image, a list of ids for several.
		*/
		onchange: (value: string | string[]) => void
		uiLocale: string
		value: FormValue
	}

	let { describedBy, field, invalid, onchange, uiLocale, value }: Props = $props()

	// The field stays the same for the life of the input.
	const target = untrack(() => field.relation!)
	const library = untrack(() => target.media!)
	const isMultiple = untrack(() => field.kind === 'relations')
	const max = untrack(() => field.field.maxSelect ?? 1)
	const thumb = untrack(() => pickerThumb(library.file))

	const chosen = $derived(
		Array.isArray(value) ? value.map(String) : typeof value === 'string' && value !== '' ? [value] : [],
	)

	const known = new SvelteMap<string, RecordModel>()
	const asked = new SvelteSet<string>()
	const loading = new SvelteSet<string>()
	let chosenError = $state('')
	let token = $state<string>()

	let isOpen = $state(false)
	// eslint-disable-next-line unicorn/no-null -- the empty value of the button's `ref`
	let chooseButton = $state<HTMLElement | null>(null)

	onMount(() => {
		if (library.file.protected) void pb.files.getToken().then(next => (token = next))
	})

	$effect(() => {
		const ids = chosen
		untrack(() => void nameChosen(ids))
	})

	function altOf(record: RecordModel | undefined, recordId: string): string {
		const alt: unknown = record && library.altField ? record[library.altField] : undefined
		if (typeof alt === 'string' && alt !== '') return alt
		if (record) return mediaFileName(library, record) ?? record.id
		return loading.has(recordId) ? m.relation_loading() : recordId
	}

	function choose(record: RecordModel) {
		known.set(record.id, record)
		if (!isMultiple) {
			onchange(record.id)
			isOpen = false
		} else if (chosen.includes(record.id)) {
			onchange(chosen.filter(item => item !== record.id))
		} else if (chosen.length < max) {
			onchange([...chosen, record.id])
		}
	}

	function failure(error: unknown): string {
		if (!(error instanceof ClientResponseError)) throw error
		if (error.status === 401) {
			signOut(pb)
			void goto(resolve('/(auth)/login'))
		}
		return m.relation_error({ message: error.message })
	}

	async function nameChosen(ids: string[]) {
		const missing = ids.filter(item => !known.has(item) && !asked.has(item))
		if (missing.length === 0) return
		for (const item of missing) {
			asked.add(item)
			loading.add(item)
		}
		chosenError = ''
		try {
			const found = await fetchChosen(pb, target, missing)
			for (const record of found) known.set(record.id, record)
		} catch (error) {
			for (const item of missing) asked.delete(item)
			chosenError = failure(error)
		} finally {
			for (const item of missing) loading.delete(item)
		}
	}

	async function remove(recordId: string) {
		onchange(isMultiple ? chosen.filter(item => item !== recordId) : '')
		await tick()
		chooseButton?.focus()
	}

	function thumbnailOf(record: RecordModel | undefined): string | undefined {
		const name = record && mediaFileName(library, record)
		const isReadable = token !== undefined || !library.file.protected
		return record && name && isReadable ? pb.files.getURL(record, name, { thumb, token }) : undefined
	}
</script>

{#snippet image(record: RecordModel | undefined, className: string)}
	{@const url = thumbnailOf(record)}
	{#if url}
		<img class={['bg-muted rounded-md object-cover', className]} alt="" loading="lazy" src={url} />
	{:else}
		<span class={['bg-muted text-muted-foreground grid place-items-center rounded-md', className]}>
			<ImageIcon class="size-5" />
		</span>
	{/if}
{/snippet}

{#if chosen.length > 0}
	<ul class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2" aria-live="polite">
		{#each chosen as recordId (recordId)}
			{@const record = known.get(recordId)}
			<li class="bg-card relative grid gap-1 rounded-lg border p-1.5 text-sm">
				{@render image(record, 'aspect-square w-full')}
				<span class="line-clamp-2 min-w-0 px-0.5 break-words">{altOf(record, recordId)}</span>
				{#if !field.readonly}
					<Button
						class="bg-background/80 absolute top-2 right-2"
						aria-label={m.relation_remove({ name: altOf(record, recordId) })}
						onclick={() => remove(recordId)}
						size="icon-sm"
						variant="outline"
					>
						<XIcon />
					</Button>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="text-muted-foreground text-sm">{m.media_none()}</p>
{/if}
{#if chosenError}
	<p class="text-destructive text-sm" role="alert">{chosenError}</p>
{/if}

{#if !field.readonly}
	<MediaPicker
		canUpload={!isMultiple || chosen.length < max}
		{chosen}
		closeLabel={isMultiple ? m.relation_done() : m.relation_close()}
		description={isMultiple ? m.relation_selected({ count: chosen.length, max }) : undefined}
		isFull={isMultiple && chosen.length >= max}
		onchoose={choose}
		{target}
		title={m.relation_choose({ field: field.label })}
		{uiLocale}
		bind:open={isOpen}
	>
		{#snippet trigger({ props })}
			<Button
				{...props}
				class="justify-self-start"
				aria-describedby={describedBy}
				aria-invalid={invalid}
				variant="outline"
				bind:ref={chooseButton}
			>
				{m.relation_choose({ field: field.label })}
			</Button>
		{/snippet}
	</MediaPicker>
{/if}
