<script lang="ts">
	import type { RecordModel } from 'pocketbase'
	import type { Snippet } from 'svelte'

	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import ImageIcon from '@lucide/svelte/icons/image'
	import { ClientResponseError } from 'pocketbase'
	import { onDestroy, onMount, untrack } from 'svelte'

	import type { RelationTarget } from '#lib/relation/target.js'

	import { signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import * as Dialog from '#lib/components/ui/dialog/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { searchRecords } from '#lib/relation/records.js'
	import { m } from '#paraglide/messages.js'

	import { mediaFileName, pickerThumb } from './library'
	import MediaUpload from './media-upload.svelte'

	interface Props {
		/**
		Whether an upload is offered; false once a list of images is full.
		*/
		canUpload?: boolean
		/**
		The ids shown as chosen.
		*/
		chosen?: string[]
		/**
		The label of the button that closes the picker.
		*/
		closeLabel?: string
		/**
		Shown under the title, such as how many images are chosen.
		*/
		description?: string
		/**
		Whether tiles that are not chosen are disabled, for a list of images that is full.
		*/
		isFull?: boolean
		/**
		Called when the user picks an image or uploads one. The picker stays open; close it with `open`.
		*/
		onchoose: (record: RecordModel) => void
		/**
		Where the keyboard goes when the picker closes; by default back to its button.
		*/
		onCloseAutoFocus?: (event: Event) => void
		open?: boolean
		/**
		The media library, with `media` set.
		*/
		target: RelationTarget
		title: string
		/**
		The button that opens the picker; spread `props` on it.
		*/
		trigger: Snippet<[{ props: Record<string, unknown> }]>
		uiLocale: string
	}

	let {
		canUpload = true,
		chosen = [],
		closeLabel = m.relation_close(),
		description,
		isFull = false,
		onchoose,
		onCloseAutoFocus,
		open = $bindable(false),
		target,
		title,
		trigger,
		uiLocale,
	}: Props = $props()

	// The library stays the same for the life of the picker.
	const library = untrack(() => target.media!)
	const thumb = untrack(() => pickerThumb(library.file))
	const searchDelay = 300
	const id = $props.id()

	let token = $state<string>()
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

	onMount(() => {
		if (library.file.protected) void pb.files.getToken().then(next => (token = next))
	})

	onDestroy(() => clearTimeout(timer))

	// Opened by its button or by the code that owns `open`: either way it starts with every image.
	$effect(() => {
		const isOpen = open
		untrack(() => opened(isOpen))
	})

	function altOf(record: RecordModel): string {
		const alt: unknown = library.altField ? record[library.altField] : undefined
		return typeof alt === 'string' && alt !== '' ? alt : (mediaFileName(library, record) ?? record.id)
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

	function opened(isNowOpen: boolean) {
		clearTimeout(timer)
		if (!isNowOpen) {
			latest++
			return
		}
		search = ''
		startSearch()
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

	function thumbnailOf(record: RecordModel): string | undefined {
		const name = mediaFileName(library, record)
		const isReadable = token !== undefined || !library.file.protected
		return name && isReadable ? pb.files.getURL(record, name, { thumb, token }) : undefined
	}

	function uploaded(record: RecordModel) {
		results = [record, ...results.filter(item => item.id !== record.id)]
		total++
		onchoose(record)
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="flex max-h-[90dvh] flex-col sm:max-w-3xl" {onCloseAutoFocus} showCloseButton={false}>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description aria-live="polite">{description}</Dialog.Description>
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
					<ul class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2" aria-label={title}>
						{#each results as record (record.id)}
							{@const isChosen = chosen.includes(record.id)}
							{@const url = thumbnailOf(record)}
							<li>
								<button
									class="hover:bg-muted focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-accent grid w-full gap-1 rounded-lg border border-transparent p-1.5 text-left text-sm outline-none focus-visible:ring-3 disabled:opacity-50"
									aria-pressed={isChosen}
									disabled={isFull && !isChosen}
									onclick={() => onchoose(record)}
									type="button"
								>
									{#if url}
										<img
											class="bg-muted aspect-square w-full rounded-md object-cover"
											alt=""
											loading="lazy"
											src={url}
										/>
									{:else}
										<span
											class="bg-muted text-muted-foreground grid aspect-square w-full place-items-center rounded-md"
										>
											<ImageIcon class="size-5" />
										</span>
									{/if}
									<span class="line-clamp-2 min-w-0 px-0.5 break-words">{altOf(record)}</span>
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

			{#if canUpload}
				<MediaUpload {library} onuploaded={uploaded} {uiLocale} />
			{/if}
		</div>

		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button {...props} variant="outline">{closeLabel}</Button>
				{/snippet}
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
