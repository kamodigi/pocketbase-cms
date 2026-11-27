<script lang="ts">
	import type { RecordModel } from 'pocketbase'

	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import XIcon from '@lucide/svelte/icons/x'
	import { ClientResponseError } from 'pocketbase'
	import { onDestroy, tick, untrack } from 'svelte'
	import { SvelteMap, SvelteSet } from 'svelte/reactivity'

	import type { FormField } from '#lib/form/model.js'
	import type { FormValue } from '#lib/form/values.js'

	import { signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import * as Dialog from '#lib/components/ui/dialog/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	import { recordName } from './name'
	import { fetchChosen, searchRecords } from './records'

	interface Props {
		describedBy?: string
		/**
		A `relation` or `relations` field.
		*/
		field: FormField
		invalid?: 'true'
		/**
		Called with the new value: an id or "" for one record, a list of ids for several.
		*/
		onchange: (value: string | string[]) => void
		value: FormValue
	}

	let { describedBy, field, invalid, onchange, value }: Props = $props()

	// The field stays the same for the life of the input.
	const target = untrack(() => field.relation!)
	const isMultiple = untrack(() => field.kind === 'relations')
	const max = untrack(() => field.field.maxSelect ?? 1)
	// Long enough not to search on every key, short enough to feel immediate.
	const searchDelay = 300
	const id = $props.id()

	const chosen = $derived(Array.isArray(value) ? value : typeof value === 'string' && value !== '' ? [value] : [])

	// The chosen records seen so far, to name them.
	const known = new SvelteMap<string, RecordModel>()
	// Ids already asked for: one that did not come back is shown as it is.
	const asked = new SvelteSet<string>()
	const loading = new SvelteSet<string>()
	let chosenError = $state('')

	let isOpen = $state(false)
	let search = $state('')
	// The search the results are for.
	let searched = $state('')
	let results = $state<RecordModel[]>([])
	let page = $state(0)
	let totalPages = $state(0)
	let total = $state(0)
	let isSearching = $state(false)
	let searchError = $state('')
	let timer: ReturnType<typeof setTimeout> | undefined
	// Only the answer to the latest request is shown.
	let latest = 0
	// eslint-disable-next-line unicorn/no-null -- the empty value of the button's `ref`
	let chooseButton = $state<HTMLElement | null>(null)

	$effect(() => {
		const ids = chosen
		untrack(() => void nameChosen(ids))
	})

	onDestroy(() => clearTimeout(timer))

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

	function chosenName(recordId: string): string {
		const record = known.get(recordId)
		if (record) return nameOf(record)
		return loading.has(recordId) ? m.relation_loading() : recordId
	}

	/**
	The message of a failed request; a refused token signs out instead.
	*/
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
			// A record added meanwhile can push one onto the next page as well.
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

	function nameOf(record: RecordModel): string {
		return recordName(record, target.nameKeys, target.baseLocale)
	}

	function opened(isNowOpen: boolean) {
		clearTimeout(timer)
		if (!isNowOpen) {
			latest++
			return
		}
		search = ''
		results = []
		page = 0
		total = 0
		totalPages = 0
		startSearch()
	}

	async function remove(recordId: string) {
		onchange(isMultiple ? chosen.filter(item => item !== recordId) : '')
		// The button that had the focus is gone.
		await tick()
		chooseButton?.focus()
	}

	function scheduleSearch(event: Event) {
		clearTimeout(timer)
		// Half-composed text of an input method (Japanese, Chinese) is not searched for.
		if (event instanceof InputEvent && event.isComposing) return
		timer = setTimeout(() => {
			if (search.trim() !== searched) startSearch()
		}, searchDelay)
	}

	function startSearch() {
		clearTimeout(timer)
		searched = search.trim()
		// Results of another search are not shown while this one loads.
		results = []
		page = 0
		totalPages = 0
		void load(1)
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault()
		startSearch()
	}
</script>

{#if chosen.length > 0}
	<ul class="grid gap-1" aria-live="polite">
		{#each chosen as recordId (recordId)}
			<li class="bg-card flex items-center gap-2 rounded-lg border py-1 pr-1 pl-3 text-sm">
				<span class="min-w-0 flex-1 break-words">{chosenName(recordId)}</span>
				{#if !field.readonly}
					<Button
						aria-label={m.relation_remove({ name: chosenName(recordId) })}
						onclick={() => remove(recordId)}
						size="icon-sm"
						variant="ghost"
					>
						<XIcon />
					</Button>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="text-muted-foreground text-sm">{m.relation_none()}</p>
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
		<Dialog.Content class="flex max-h-[85dvh] flex-col sm:max-w-lg" showCloseButton={false}>
			<Dialog.Header>
				<Dialog.Title>{m.relation_choose({ field: field.label })}</Dialog.Title>
				{#if isMultiple}
					<Dialog.Description aria-live="polite">
						{m.relation_selected({ count: chosen.length, max })}
					</Dialog.Description>
				{/if}
			</Dialog.Header>

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

			<div class="min-h-40 flex-1 overflow-y-auto">
				{#if results.length > 0}
					<ul class="grid gap-1 p-1" aria-label={field.label}>
						{#each results as record (record.id)}
							{@const isChosen = chosen.includes(record.id)}
							<li>
								{#if isMultiple}
									<label class="hover:bg-muted flex items-center gap-2 rounded-lg px-2 py-2">
										<input
											class="accent-primary size-4 shrink-0"
											checked={isChosen}
											disabled={!isChosen && chosen.length >= max}
											onchange={() => choose(record)}
											type="checkbox"
										/>
										<span class="min-w-0 break-words">{nameOf(record)}</span>
									</label>
								{:else}
									<button
										class="hover:bg-muted focus-visible:ring-ring/50 aria-pressed:bg-accent w-full rounded-lg px-2 py-2 text-left break-words outline-none focus-visible:ring-3 aria-pressed:font-medium"
										aria-pressed={isChosen}
										onclick={() => choose(record)}
										type="button"
									>
										{nameOf(record)}
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				<p class="text-muted-foreground px-3 py-2" role="status">
					{#if isSearching}
						{m.relation_loading()}
					{:else if searchError === ''}
						{#if results.length > 0}
							{m.list_total({ count: total })}
						{:else}
							{searched === '' ? m.relation_empty() : m.relation_no_results()}
						{/if}
					{/if}
				</p>
				{#if searchError}
					<div class="grid justify-items-start gap-2 px-3">
						<p class="text-destructive" role="alert">{searchError}</p>
						<Button onclick={() => load(page + 1)} size="sm" variant="outline">{m.relation_retry()}</Button>
					</div>
				{:else if page < totalPages}
					<div class="px-3 pb-1">
						<Button disabled={isSearching} onclick={() => load(page + 1)} size="sm" variant="outline">
							{m.relation_load_more()}
						</Button>
					</div>
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
