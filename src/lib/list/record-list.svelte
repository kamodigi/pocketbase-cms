<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { navigating } from '$app/state'
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down'
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up'
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down'
	import { onDestroy, untrack } from 'svelte'

	import { Button } from '#lib/components/ui/button/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import * as Select from '#lib/components/ui/select/index.js'
	import * as Table from '#lib/components/ui/table/index.js'
	import { type CmsConfig, type SchemaCollection } from '#lib/config/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'
	import { getLocale } from '#paraglide/runtime.js'

	import type { RecordList } from './load'

	import { type CellContext, listCell, recordTitle } from './cell'
	import { type Column, isDateColumn, offeredStates } from './model'
	import { type ListQuery, publishStates, serializeListQuery } from './query'
	import RecordCell from './record-cell.svelte'
	import { stateLabels } from './state-labels'

	interface Props {
		/**
		The collection's name in PocketBase.
		*/
		collection: string
		config: CmsConfig
		/**
		The collection's name on screen.
		*/
		label: string
		list: RecordList
		schema: SchemaCollection[]
	}

	let { collection, config, label, list, schema }: Props = $props()

	// Long enough not to search on every key, short enough to feel immediate.
	const searchDelay = 300
	const id = $props.id()

	const context = $derived<CellContext>({
		config,
		fileToken: list.fileToken,
		model: list.model,
		now: new Date(),
		pb,
		schema,
		uiLocale: getLocale(),
	})
	const states = $derived(offeredStates(list.model))
	// The column that links to the record.
	const titleColumn = $derived(
		list.model.columns.find(column => column.field && column.field.name === list.model.titleField) ??
			list.model.columns[0],
	)
	const sortTerm = $derived((list.query.sort || list.model.defaultSort).split(',', 1)[0] ?? '')
	const isFiltered = $derived(list.query.search !== '' || list.query.status !== '')
	const totalPages = $derived(list.result.totalPages)

	// What the user asked for last. It runs ahead of `list` while records are loading.
	let requested = untrack(() => list.query)
	let search = $state(requested.search)
	let timer: ReturnType<typeof setTimeout> | undefined

	// A search that comes from the URL (back, a link to this list) replaces what is in the box. The
	// answer to the box's own search does not, so typing can go on while it loads.
	$effect(() => {
		const { query } = list
		untrack(() => {
			if (query.search !== requested.search) {
				clearTimeout(timer)
				search = query.search
			}
			requested = query
		})
	})

	// A search still waiting must not take the user back from where they are going.
	beforeNavigate(() => clearTimeout(timer))
	onDestroy(() => clearTimeout(timer))

	function clearFilters() {
		search = ''
		narrow({ status: '' })
	}

	function handleSearch(event: SubmitEvent) {
		event.preventDefault()
		narrow({})
	}

	/**
	Changes to what is listed start over at the first page and don't add to the browser history.
	*/
	function narrow(changes: Partial<ListQuery>) {
		show({ ...changes, page: 1 }, { replace: true, reset: false })
	}

	function scheduleSearch(event: Event) {
		clearTimeout(timer)
		// Half-composed text of an input method (Japanese, Chinese) is not searched for.
		if (event instanceof InputEvent && event.isComposing) return
		timer = setTimeout(() => {
			if (search.trim() !== requested.search) narrow({})
		}, searchDelay)
	}

	function show(changes: Partial<ListQuery>, options: { replace?: boolean; reset?: boolean } = {}) {
		clearTimeout(timer)
		const text = search.trim()
		const next = { ...requested, ...changes, search: text }
		if (text !== requested.search) next.page = 1
		requested = next
		const path = resolve('/(app)/collections/[collection]', { collection })
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- a resolved path plus the list's query
		void goto(`${path}${serializeListQuery(next)}`, options)
	}

	function sortBy(column: Column) {
		const name = column.field!.name
		narrow({ sort: sortTerm === `-${name}` ? name : `-${name}` })
	}

	function sortDirection(column: Column): 'ascending' | 'descending' | undefined {
		const name = column.field?.name
		if (name === undefined || !isDateColumn(column)) return undefined
		if (sortTerm === `-${name}`) return 'descending'
		return sortTerm === name || sortTerm === `+${name}` ? 'ascending' : undefined
	}
</script>

{#if list.model.searchFields.length > 0 || states.length > 0}
	<div class="flex flex-wrap items-end gap-3">
		{#if list.model.searchFields.length > 0}
			<form class="grid w-full gap-1.5 sm:w-72" onsubmit={handleSearch} role="search">
				<Label for="{id}-search">{m.list_search()}</Label>
				<Input
					id="{id}-search"
					autocomplete="off"
					bind:value={search}
					maxlength={200}
					oncompositionend={scheduleSearch}
					oninput={scheduleSearch}
					type="search"
				/>
			</form>
		{/if}
		{#if states.length > 0}
			<div class="grid gap-1.5">
				<Label for="{id}-status">{m.list_column_status()}</Label>
				<Select.Root
					onValueChange={value => narrow({ status: publishStates.find(state => state === value) ?? '' })}
					type="single"
					value={list.query.status || 'all'}
				>
					<Select.Trigger class="w-44" id="{id}-status">
						{list.query.status ? stateLabels[list.query.status]() : m.list_state_all()}
					</Select.Trigger>
					<Select.Content>
						<Select.Item label={m.list_state_all()} value="all" />
						{#each states as state (state)}
							<Select.Item label={stateLabels[state]()} value={state} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}
	</div>
{/if}

<div class="grid gap-3" aria-busy={navigating.to !== null}>
	<p class="text-muted-foreground text-sm" role="status">
		{#if list.result.totalItems > 0}
			{m.list_total({ count: list.result.totalItems })}
		{:else if isFiltered}
			{m.list_no_matches()}
		{:else}
			{m.list_empty()}
		{/if}
	</p>

	{#if list.result.items.length > 0}
		<div class="bg-card overflow-x-auto rounded-xl border">
			<Table.Root>
				<Table.Caption class="sr-only">{label}</Table.Caption>
				<Table.Header>
					<Table.Row>
						{#each list.model.columns as column (column.key)}
							<Table.Head aria-sort={sortDirection(column)}>
								{#if isDateColumn(column)}
									{@const direction = sortDirection(column)}
									<Button class="-ml-2.5 text-sm" onclick={() => sortBy(column)} size="sm" variant="ghost">
										{column.label}
										{#if direction === 'descending'}
											<ArrowDownIcon aria-hidden="true" />
										{:else if direction === 'ascending'}
											<ArrowUpIcon aria-hidden="true" />
										{:else}
											<ArrowUpDownIcon aria-hidden="true" class="text-muted-foreground" />
										{/if}
									</Button>
								{:else}
									{column.label}
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each list.result.items as record (record.id)}
						<Table.Row>
							{#each list.model.columns as column (column.key)}
								{@const cell = listCell(column, record, context)}
								<Table.Cell>
									{#if column === titleColumn}
										<a
											class="text-link font-medium underline underline-offset-2"
											href={resolve('/(app)/collections/[collection]/[id]', { collection, id: record.id })}
										>
											{#if cell.kind === 'text' || cell.kind === 'files'}
												<RecordCell {cell} />
											{:else}
												{recordTitle(record, context) || m.list_untitled()}
											{/if}
										</a>
									{:else}
										<RecordCell {cell} />
									{/if}
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{:else if isFiltered}
		<Button class="justify-self-start" onclick={clearFilters} variant="outline">{m.list_clear_filters()}</Button>
	{/if}

	{#if totalPages > 1}
		<nav class="flex flex-wrap items-center gap-3" aria-label={m.list_pagination()}>
			<Button disabled={list.query.page <= 1} onclick={() => show({ page: list.query.page - 1 })} variant="outline">
				{m.list_previous()}
			</Button>
			<span class="text-sm tabular-nums">{m.list_page({ page: list.query.page, total: totalPages })}</span>
			<Button
				disabled={list.query.page >= totalPages}
				onclick={() => show({ page: list.query.page + 1 })}
				variant="outline"
			>
				{m.list_next()}
			</Button>
		</nav>
	{/if}
</div>
