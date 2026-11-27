<script lang="ts">
	import type { RecordModel } from 'pocketbase'

	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import ImageIcon from '@lucide/svelte/icons/image'
	import XIcon from '@lucide/svelte/icons/x'
	import { ClientResponseError } from 'pocketbase'
	import { onDestroy, onMount, tick, untrack } from 'svelte'
	import { SvelteMap, SvelteSet } from 'svelte/reactivity'

	import type { FormField } from '#lib/form/model.js'
	import type { FormValue } from '#lib/form/values.js'

	import { signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import * as Dialog from '#lib/components/ui/dialog/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { fetchChosen, searchRecords } from '#lib/relation/records.js'
	import { m } from '#paraglide/messages.js'

	import { mediaFileName, pickerThumb } from './library'
	import MediaUpload from './media-upload.svelte'

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
	const searchDelay = 300
	const id = $props.id()

	const chosen = $derived(
		Array.isArray(value) ? value.map(String) : typeof value === 'string' && value !== '' ? [value] : [],
	)

	const known = new SvelteMap<string, RecordModel>()
	const asked = new SvelteSet<string>()
	const loading = new SvelteSet<string>()
	let chosenError = $state('')
	let token = $state<string>()

	let isOpen = $state(false)
	let search = $state('')
	let searched = $state('')
	let results = $state<RecordModel[]>([])
	let page = $state(0)
	let totalPages = $state(0)
	let total = $state(0)
	let isSearching = $state(false)
	let searchError = $state('')
	let timer: ReturnType<typeof setTimeout> | undefined
	let latest = 0
	// eslint-disable-next-line unicorn/no-null -- the empty value of the button's `ref`
	let chooseButton = $state<HTMLElement | null>(null)

	onMount(() => {
		if (library.file.protected) void pb.files.getToken().then(next => (token = next))
	})

	$effect(() => {
		const ids = chosen
		untrack(() => void nameChosen(ids))
	})

	onDestroy(() => clearTimeout(timer))

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

	async function load(next: number) {
		const request = ++latest
		const text = searched
		isSearching = true
		searchError = ''
		try {
			const result = await searchRecords(pb, target, { page: next, search: text })
			if (request !== latest) return
			const seen = new Set(next === 1 ? [] : results.map(record => record.id))
			results = [...(next === 1 ? [] : results), ...result.items.filter(record => !seen.has(record.id))]
			page = result.page
			total = result.totalItems
			totalPages = result.totalPages
		} catch (error) {
			if (request !== latest) return
			searchError = failure(error)
		}
		isSearching = false
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

	function opened(isNowOpen: boolean) {
		clearTimeout(timer)
		if (!isNowOpen) {
			latest++
			return
		}
		search = ''
		startSearch()
	}

	async function remove(recordId: string) {
		onchange(isMultiple ? chosen.filter(item => item !== recordId) : '')
		await tick()
		chooseButton?.focus()
	}

	function scheduleSearch(event: Event) {
		clearTimeout(timer)
		if (event instanceof InputEvent && event.isComposing) return
		timer = setTimeout(() => {
			if (search.trim() !== searched) startSearch()
		}, searchDelay)
	}

	function startSearch() {
		clearTimeout(timer)
		searched = search.trim()
		results = []
		page = 0
		totalPages = 0
		void load(1)
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault()
		startSearch()
	}

	function thumbnailOf(record: RecordModel | undefined): string | undefined {
		const name = record && mediaFileName(library, record)
		const isReadable = token !== undefined || !library.file.protected
		return record && name && isReadable ? pb.files.getURL(record, name, { thumb, token }) : undefined
	}

	function uploaded(record: RecordModel) {
		results = [record, ...results.filter(item => item.id !== record.id)]
		total++
		choose(record)
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
	<Dialog.Root onOpenChange={opened} bind:open={isOpen}>
		<Dialog.Trigger>
			{#snippet child({ props })}
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
		</Dialog.Trigger>
		<Dialog.Content class="flex max-h-[90dvh] flex-col sm:max-w-3xl" showCloseButton={false}>
			<Dialog.Header>
				<Dialog.Title>{m.relation_choose({ field: field.label })}</Dialog.Title>
				{#if isMultiple}
					<Dialog.Description aria-live="polite">
						{m.relation_selected({ count: chosen.length, max })}
					</Dialog.Description>
				{/if}
			</Dialog.Header>

			<div class="grid min-h-0 flex-1 gap-4 overflow-y-auto p-1">
				<form class="grid gap-1.5" onsubmit={submitSearch} role="search">
					<Label for="{id}-search">{m.relation_search()}</Label>
					<Input
						id="{id}-search"
						autocomplete="off"
						oncompositionend={scheduleSearch}
						oninput={scheduleSearch}
						type="search"
						bind:value={search}
					/>
				</form>

				<div class="grid gap-2">
					{#if results.length > 0}
						<ul class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2" aria-label={field.label}>
							{#each results as record (record.id)}
								{@const isChosen = chosen.includes(record.id)}
								<li>
									<button
										class="hover:bg-muted focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-accent grid w-full gap-1 rounded-lg border border-transparent p-1.5 text-left text-sm outline-none focus-visible:ring-3 disabled:opacity-50"
										aria-pressed={isChosen}
										disabled={isMultiple && !isChosen && chosen.length >= max}
										onclick={() => choose(record)}
										type="button"
									>
										{@render image(record, 'aspect-square w-full')}
										<span class="line-clamp-2 min-w-0 px-0.5 break-words">{altOf(record, record.id)}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<p class="text-muted-foreground px-1 text-sm" role="status">
						{#if isSearching}
							{m.relation_loading()}
						{:else if searchError === ''}
							{#if results.length > 0}
								{m.list_total({ count: total })}
							{:else}
								{searched === '' ? m.media_empty() : m.media_no_results()}
							{/if}
						{/if}
					</p>
					{#if searchError}
						<div class="grid justify-items-start gap-2 px-1">
							<p class="text-destructive text-sm" role="alert">{searchError}</p>
							<Button onclick={() => load(page + 1)} size="sm" variant="outline">{m.relation_retry()}</Button>
						</div>
					{:else if page < totalPages}
						<Button
							class="justify-self-start"
							disabled={isSearching}
							onclick={() => load(page + 1)}
							size="sm"
							variant="outline"
						>
							{m.relation_load_more()}
						</Button>
					{/if}
				</div>

				{#if !isMultiple || chosen.length < max}
					<MediaUpload {library} onuploaded={uploaded} {uiLocale} />
				{/if}
			</div>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} variant="outline">{isMultiple ? m.relation_done() : m.relation_close()}</Button>
					{/snippet}
				</Dialog.Close>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
